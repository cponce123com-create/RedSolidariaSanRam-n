import { Router, type IRouter } from "express";
import { z } from "zod";
import { db, adminUsersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAdmin } from "../middleware/require-admin";
import { adminActionLimiter, reauthLimiter, twoFactorLoginLimiter } from "../middleware/rate-limit";
import { logAuditAction } from "../middleware/auth-utils";
import { buildOtpauthUri, generateSecret, verifyTOTPStep } from "../lib/totp";
import {
  ADMIN_2FA_CHALLENGE_TTL_MS,
  clearAdminTwoFactorChallenge,
  establishAdminSession,
  saveAdminTwoFactorChallenge,
} from "../lib/session-security";
import { verifySuperadminReauth } from "../lib/admin-reauth";
import { consumeTOTPLoginStep, resetTOTPLoginUsage, totpAccountKey } from "../lib/totp-replay";
import { ENV_SUPERADMIN_USERNAME } from "../lib/superadmin-credentials";
import {
  ENV_SUPERADMIN_ID,
  envTwoFactorActive,
  isEnvTwoFactorDisabledByEnv,
  readEnvSuperadminTwoFactor,
  resolveTwoFactorAccount,
} from "../lib/two-factor-account";
import { revokeAdminSessions, revokeOtherAdminSessions } from "../lib/admin-user-guards";
import {
  clearFailedAttempts,
  clearFailedAttemptsForUser,
  getLockoutRemainingMs,
  lockoutKey,
  MAX_2FA_ATTEMPTS,
  registerFailedAttempt,
} from "../lib/two-factor-lockout";

const router: IRouter = Router();

const ISSUER = "Red Solidaria San Ramón";

// El reto de 2FA vive en la sesión: el cuerpo SOLO lleva el código. Se rechazan
// campos desconocidos (p. ej. el antiguo `userId`) para que un cliente viejo no
// crea que puede elegir la cuenta desde el navegador.
const twoFactorLoginSchema = z
  .object({
    code: z.string().regex(/^\d{6}$/, "El código debe tener 6 dígitos"),
  })
  .strict();

// La contraseña es obligatoria para CUALQUIER cambio de 2FA (step-up): una
// cookie robada no basta para activar, desactivar o resetear el segundo factor.
// Se deja `optional` en Zod para que la falta se responda como reauth_required
// (401) y no como un error de formato engañoso.
const setupSchema = z.object({
  password: z.string().optional(),
});

const verifySchema = z.object({
  password: z.string().optional(),
  code: z.string().regex(/^\d{6}$/, "El código debe tener 6 dígitos"),
});

const disableSchema = z.object({
  password: z.string().optional(),
  code: z.string().regex(/^\d{6}$/, "El código debe tener 6 dígitos"),
});

const resetSchema = z.object({
  password: z.string().optional(),
  code: z.string().regex(/^\d{6}$/, "El código debe tener 6 dígitos").optional(),
});


function ipOf(req: any): string | null {
  return req.ip || req.connection?.remoteAddress || null;
}

function uaOf(req: any): string | null {
  return req.get("user-agent") || null;
}

/** Cuenta que debe superar el paso 2 del login, sea fila de tabla o entorno. */
interface LoginChallenge {
  id: number;
  username: string;
  name: string;
  role: string;
  secret: string;
  isEnvAccount: boolean;
}

/**
 * Resuelve la cuenta del reto de 2FA a partir del `userId` que quedó guardado en
 * la SESIÓN del servidor al validar la contraseña. Cubre las DOS formas de
 * superadministrador: una fila de `admin_users` y el superadmin de respaldo por
 * variables de entorno (`id: 0`), cuyo secreto vive en `env_superadmin_2fa`.
 * Devuelve `null` si la cuenta no existe, está inactiva o no tiene 2FA: en todos
 * esos casos la respuesta es el mismo 401 genérico, para no revelar el estado de
 * una cuenta.
 */
async function resolveLoginChallenge(userId: number): Promise<LoginChallenge | null> {
  if (userId === ENV_SUPERADMIN_ID) {
    const state = await readEnvSuperadminTwoFactor();
    // El escape hatch inutiliza también ESTE camino: si el operador declaró que
    // se ignore el 2FA del entorno, un código no debe abrir sesión por sí solo.
    if (!envTwoFactorActive(state) || !state.secret) return null;
    return {
      id: ENV_SUPERADMIN_ID,
      username: ENV_SUPERADMIN_USERNAME,
      name: "Superadmin",
      role: "superadmin",
      secret: state.secret,
      isEnvAccount: true,
    };
  }

  const [user] = await db
    .select()
    .from(adminUsersTable)
    .where(eq(adminUsersTable.id, userId));
  if (!user || !user.active || !user.twoFactorEnabled || !user.twoFactorSecret) return null;
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
    secret: user.twoFactorSecret,
    isEnvAccount: false,
  };
}

/**
 * Step-up para gestionar el 2FA: exige la contraseña actual y, si la cuenta ya
 * tiene 2FA, también el código vigente. Sin esto, una cookie robada podía
 * activar un nuevo autenticador (o desactivar el existente) sin conocer la
 * contraseña. Devuelve `false` habiendo respondido ya al cliente.
 */
async function requireTwoFactorReauth(
  req: any,
  res: any,
  password: unknown,
  totpCode: unknown,
  operation: string,
): Promise<boolean> {
  const admin = req.session?.adminUser;
  if (!admin) {
    res.status(401).json({ error: "unauthorized", message: "Sesión no autenticada" });
    return false;
  }

  const result = await verifySuperadminReauth({
    userId: admin.id,
    username: admin.username,
    password: typeof password === "string" ? password : "",
    totpCode: typeof totpCode === "string" ? totpCode : null,
  });
  if (result.ok) return true;

  await logAuditAction({
    userId: admin.id,
    username: admin.username,
    action: "ADMIN_REAUTH_FAILED",
    resource: "admin_users",
    ipAddress: ipOf(req),
    userAgent: uaOf(req),
    details: { operation, code: result.code },
  });
  res.status(401).json({ error: "unauthorized", code: result.code, message: result.message });
  return false;
}

// ─── POST /admin/2fa/login — paso 2 del login (contraseña OK + 2FA activo) ───
router.post("/admin/2fa/login", twoFactorLoginLimiter, async (req, res) => {
  const parsed = twoFactorLoginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "validation_error",
      message: "Código de 6 dígitos requerido. La verificación va ligada a la sesión iniciada con la contraseña.",
    });
  }
  const { code } = parsed.data;

  // El reto NO viene del cuerpo: lo creó /admin/login en ESTA sesión del servidor
  // tras validar la contraseña. Sin cookie/reto no hay ninguna cuenta a la que
  // aplicarle el código, aunque el atacante conozca el id del administrador.
  const pending = req.session?.pendingAdminTwoFactor;
  if (!pending) {
    return res.status(401).json({
      error: "unauthorized",
      message: "La verificación expiró. Vuelve a iniciar sesión.",
    });
  }

  const currentIp = ipOf(req);
  const currentUa = uaOf(req);
  const expired = Date.now() - pending.issuedAt > ADMIN_2FA_CHALLENGE_TTL_MS;
  const originChanged =
    (!!pending.ip && !!currentIp && pending.ip !== currentIp) ||
    (!!pending.userAgent && !!currentUa && pending.userAgent !== currentUa);

  if (!Number.isInteger(pending.userId) || expired || originChanged) {
    await clearAdminTwoFactorChallenge(req);
    return res.status(401).json({
      error: "unauthorized",
      message: "La verificación expiró. Vuelve a iniciar sesión.",
    });
  }

  const pendingUserId = pending.userId;
  const lockoutKeyForRequest = lockoutKey(currentIp, pendingUserId);
  if ((pending.attempts ?? 0) >= MAX_2FA_ATTEMPTS) {
    await clearAdminTwoFactorChallenge(req);
    return res.status(429).json({
      error: "too_many_attempts",
      message: "Demasiados intentos fallidos de 2FA. Vuelve a iniciar sesión.",
      retryAfterSeconds: 900,
    });
  }
  const lockoutMs = getLockoutRemainingMs(lockoutKeyForRequest);
  if (lockoutMs > 0) {
    req.log?.warn({ pendingUserId }, "2FA login blocked: origin temporarily locked");
    return res.status(429).json({
      error: "too_many_attempts",
      message: `Demasiados intentos fallidos de 2FA. Intenta de nuevo en ${Math.max(1, Math.ceil(lockoutMs / 60000))} minuto(s).`,
      retryAfterSeconds: Math.ceil(lockoutMs / 1000),
    });
  }

  try {
    const challenge = await resolveLoginChallenge(pendingUserId);
    if (!challenge) {
      await clearAdminTwoFactorChallenge(req);
      return res.status(401).json({ error: "unauthorized", message: "Código incorrecto" });
    }

    const step = verifyTOTPStep(challenge.secret, code);
    const accountKey = totpAccountKey(challenge.id, challenge.isEnvAccount);
    const freshStep = step !== null && (await consumeTOTPLoginStep(accountKey, step));
    if (!freshStep) {
      await logAuditAction({
        userId: challenge.id,
        username: challenge.username,
        action: "LOGIN_2FA_FAILED",
        resource: "admin_users",
        ipAddress: currentIp,
        userAgent: currentUa,
        details: {
          reason: step === null ? "invalid_totp" : "totp_replayed",
          envAccount: challenge.isEnvAccount,
        },
      });

      pending.attempts = (pending.attempts ?? 0) + 1;
      await saveAdminTwoFactorChallenge(req);

      const { locked, remainingMs } = registerFailedAttempt(lockoutKeyForRequest);
      if (locked) {
        await logAuditAction({
          userId: challenge.id,
          username: challenge.username,
          action: "LOGIN_2FA_LOCKED",
          resource: "admin_users",
          ipAddress: currentIp,
          userAgent: currentUa,
          details: {
            reason: "too_many_failed_attempts",
            maxAttempts: MAX_2FA_ATTEMPTS,
            lockoutMinutes: Math.ceil(remainingMs / 60000),
          },
        });
        return res.status(429).json({
          error: "too_many_attempts",
          message: `Demasiados intentos fallidos de 2FA. Intenta de nuevo en ${Math.max(1, Math.ceil(remainingMs / 60000))} minuto(s).`,
          retryAfterSeconds: Math.ceil(remainingMs / 1000),
        });
      }
      return res.status(401).json({ error: "unauthorized", message: "Código incorrecto" });
    }

    // Verificación correcta: se limpia el contador de ESA clave (origen + cuenta).
    clearFailedAttempts(lockoutKeyForRequest);
    // El superadmin de entorno no tiene fila: no hay último login que anotar.
    if (!challenge.isEnvAccount) {
      await db
        .update(adminUsersTable)
        .set({ lastLoginAt: new Date() })
        .where(eq(adminUsersTable.id, challenge.id));
    }

    // Regenerar la sesión elimina el reto pendiente y cualquier dato previo.
    await establishAdminSession(req, {
      id: challenge.id,
      username: challenge.username,
      name: challenge.name,
      role: challenge.role,
    });

    await logAuditAction({
      userId: challenge.id,
      username: challenge.username,
      action: "LOGIN",
      resource: "admin_users",
      ipAddress: currentIp,
      userAgent: currentUa,
      details: { success: true, twoFactor: true, envAccount: challenge.isEnvAccount },
    });

    return res.json({
      success: true,
      message: "Login exitoso",
      user: {
        id: challenge.id,
        username: challenge.username,
        name: challenge.name,
        role: challenge.role,
      },
    });
  } catch (err) {
    req.log.error({ err }, "2FA login failed");
    return res.status(500).json({ error: "server_error", message: "Error al verificar el código" });
  }
});


// ─── POST /admin/2fa/setup — genera un secreto para el usuario logueado ───────
router.post("/admin/2fa/setup", requireAdmin, reauthLimiter, adminActionLimiter, async (req, res) => {
  const parsed = setupSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: "validation_error", message: "Datos inválidos" });
  }
  if (!(await requireTwoFactorReauth(req, res, parsed.data.password, null, "2fa_setup"))) return;

  const admin = req.session.adminUser;
  if (!admin) return res.status(401).json({ error: "unauthorized", message: "Sesión no autenticada" });
  try {
    // Cubre las dos formas de cuenta: fila de admin_users o superadmin de entorno
    // (id 0, secreto en env_superadmin_2fa). Antes el de entorno recibía un 404
    // engañoso («Usuario no encontrado») y no podía tener 2FA.
    const account = await resolveTwoFactorAccount(admin);
    if (!account) return res.status(404).json({ error: "not_found", message: "Usuario no encontrado" });
    const state = await account.state();
    if (state.enabled) {
      return res.status(400).json({ error: "validation_error", message: "2FA ya está activo. Desactívalo primero para regenerar el secreto." });
    }

    const secret = generateSecret();
    await account.saveSecret(secret);
    // Un secreto nuevo invalida el historial anti-replay del anterior: si no, un
    // paso ya consumido podría bloquear el primer login con el autenticador nuevo.
    await resetTOTPLoginUsage(totpAccountKey(account.id, account.isEnvAccount));

    await logAuditAction({
      userId: account.id,
      username: account.username,
      action: "TWO_FACTOR_SETUP",
      resource: "admin_users",
      ipAddress: ipOf(req),
      userAgent: uaOf(req),
      details: { generated: true, envAccount: account.isEnvAccount, reauthenticated: true },
    });

    return res.json({
      secret,
      otpauthUri: buildOtpauthUri(secret, account.username, ISSUER),
    });
  } catch (err) {
    req.log.error({ err }, "2FA setup failed");
    return res.status(500).json({ error: "server_error", message: "Error al generar el secreto" });
  }
});


// ─── POST /admin/2fa/verify — confirma el secreto con un código y lo activa ──
router.post("/admin/2fa/verify", requireAdmin, reauthLimiter, adminActionLimiter, async (req, res) => {
  const parsed = verifySchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: "validation_error", message: "Código de 6 dígitos requerido" });
  const { code, password } = parsed.data;
  const admin = req.session.adminUser;
  if (!admin) return res.status(401).json({ error: "unauthorized", message: "Sesión no autenticada" });

  try {
    const account = await resolveTwoFactorAccount(admin);
    if (!account) return res.status(404).json({ error: "not_found", message: "Usuario no encontrado" });
    const state = await account.state();
    if (!state.secret) {
      return res.status(400).json({ error: "validation_error", message: "Primero genera el secreto (setup)" });
    }
    if (state.enabled) {
      return res.status(400).json({ error: "validation_error", message: "2FA ya está activo" });
    }

    // La cuenta aún NO tiene 2FA activo: el step-up es la contraseña. El código
    // que se valida es el del secreto recién generado.
    if (!(await requireTwoFactorReauth(req, res, password, null, "2fa_verify"))) return;

    if (verifyTOTPStep(state.secret, code) === null) {
      await logAuditAction({
        userId: account.id,
        username: account.username,
        action: "TWO_FACTOR_VERIFY_FAILED",
        resource: "admin_users",
        ipAddress: ipOf(req),
        userAgent: uaOf(req),
        details: { reason: "invalid_totp", envAccount: account.isEnvAccount },
      });
      return res.status(401).json({ error: "unauthorized", message: "Código incorrecto" });
    }

    await account.enable();

    // Activar el segundo factor invalida las demás sesiones abiertas de la
    // cuenta (una sesión robada no debe seguir viva tras un cambio de factor).
    const revokedSessions = await revokeOtherAdminSessions(account.id, req.sessionID);

    await logAuditAction({
      userId: account.id,
      username: account.username,
      action: "TWO_FACTOR_ENABLED",
      resource: "admin_users",
      ipAddress: ipOf(req),
      userAgent: uaOf(req),
      details: { enabled: true, envAccount: account.isEnvAccount, reauthenticated: true, revokedSessions },
    });

    return res.json({ success: true, message: "2FA activado correctamente" });
  } catch (err) {
    req.log.error({ err }, "2FA verify failed");
    return res.status(500).json({ error: "server_error", message: "Error al verificar el código" });
  }
});


// ─── POST /admin/2fa/disable — desactiva 2FA del usuario logueado ─────────────
router.post("/admin/2fa/disable", requireAdmin, reauthLimiter, adminActionLimiter, async (req, res) => {
  const parsed = disableSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: "validation_error", message: "Código de 6 dígitos requerido" });
  const { code, password } = parsed.data;
  const admin = req.session.adminUser;
  if (!admin) return res.status(401).json({ error: "unauthorized", message: "Sesión no autenticada" });

  try {
    const account = await resolveTwoFactorAccount(admin);
    if (!account) return res.status(404).json({ error: "not_found", message: "Usuario no encontrado" });
    const state = await account.state();
    if (!state.secret || !state.enabled) {
      return res.status(400).json({ error: "validation_error", message: "2FA no está activo" });
    }

    // Step-up: contraseña + código vigente. `verifySuperadminReauth` comprueba
    // ambos porque la cuenta tiene 2FA activo; no hace falta verificar el código
    // otra vez después.
    if (!(await requireTwoFactorReauth(req, res, password, code, "2fa_disable"))) return;

    await account.clear();
    await resetTOTPLoginUsage(totpAccountKey(account.id, account.isEnvAccount));

    // Al desactivar 2FA con código válido se reinicia el contador de lockout de
    // la cuenta en TODOS los orígenes (la clave es compuesta).
    clearFailedAttemptsForUser(account.id);

    const revokedSessions = await revokeOtherAdminSessions(account.id, req.sessionID);

    await logAuditAction({
      userId: account.id,
      username: account.username,
      action: "TWO_FACTOR_DISABLED",
      resource: "admin_users",
      ipAddress: ipOf(req),
      userAgent: uaOf(req),
      details: { enabled: false, envAccount: account.isEnvAccount, reauthenticated: true, revokedSessions },
    });

    return res.json({ success: true, message: "2FA desactivado" });
  } catch (err) {
    req.log.error({ err }, "2FA disable failed");
    return res.status(500).json({ error: "server_error", message: "Error al desactivar 2FA" });
  }
});


// ─── POST /admin/users/:id/2fa/reset — escape hatch: superadmin desactiva 2FA ─
router.post("/admin/users/:id/2fa/reset", requireAdmin, reauthLimiter, adminActionLimiter, async (req, res) => {
  const admin = req.session.adminUser;
  const isSuper = admin && (admin.role === "superadmin" || admin.id === 0);
  if (!isSuper) return res.status(403).json({ error: "Solo superadmin" });

  const parsed = resetSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: "validation_error", message: "Código inválido" });
  }
  if (!(await requireTwoFactorReauth(req, res, parsed.data.password, parsed.data.code, "2fa_reset"))) return;

  const userId = Number(req.params.id);
  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(400).json({ error: "validation_error", message: "Usuario inválido" });
  }

  try {
    const [updated] = await db
      .update(adminUsersTable)
      .set({ twoFactorSecret: null, twoFactorEnabled: false })
      .where(eq(adminUsersTable.id, userId))
      .returning({ id: adminUsersTable.id, username: adminUsersTable.username });
    if (!updated) return res.status(404).json({ error: "not_found", message: "Usuario no encontrado" });

    await resetTOTPLoginUsage(totpAccountKey(userId, false));
    // El escape hatch también desbloquea la cuenta: como la clave es compuesta
    // (origen + cuenta), hay que limpiar las entradas de todos los orígenes.
    clearFailedAttemptsForUser(userId);
    // Un cambio de factor invalida CUALQUIER sesión abierta del usuario afectado.
    const revokedSessions = await revokeAdminSessions(userId);

    await logAuditAction({
      userId: admin?.id ?? null,
      username: admin?.username ?? null,
      action: "TWO_FACTOR_RESET",
      resource: "admin_users",
      resourceId: userId.toString(),
      ipAddress: ipOf(req),
      userAgent: uaOf(req),
      details: { targetUserId: userId, targetUsername: updated.username, reauthenticated: true, revokedSessions },
    });

    return res.json({ success: true, message: "2FA desactivado para el usuario" });
  } catch (err) {
    req.log.error({ err }, "2FA reset failed");
    return res.status(500).json({ error: "server_error", message: "Error al desactivar 2FA" });
  }
});

// ─── GET /admin/2fa/status — estado de 2FA del usuario logueado ──────────────
// (nunca expone el secreto)
router.get("/admin/2fa/status", requireAdmin, async (_req, res) => {
  const admin = _req.session.adminUser;
  if (!admin) return res.status(401).json({ error: "unauthorized", message: "Sesión no autenticada" });
  try {
    const account = await resolveTwoFactorAccount(admin);
    if (!account) return res.status(404).json({ error: "not_found", message: "Usuario no encontrado" });
    const state = await account.state();
    return res.json({
      enabled: state.enabled,
      // Metadatos para que el panel explique el caso sin exponer nada sensible:
      // que es la cuenta de respaldo por variables de entorno (su recuperación es
      // distinta) y si el operador la ha desactivado con el escape hatch.
      envAccount: account.isEnvAccount,
      disabledByEnv: account.isEnvAccount && isEnvTwoFactorDisabledByEnv(),
    });
  } catch (err) {
    _req.log.error({ err }, "2FA status failed");
    return res.status(500).json({ error: "server_error", message: "Error al consultar 2FA" });
  }
});

export default router;

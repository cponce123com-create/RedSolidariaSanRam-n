import { Router, type IRouter } from "express";
import { z } from "zod";
import { db, adminUsersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAdmin } from "../middleware/require-admin";
import { adminActionLimiter, loginLimiter } from "../middleware/rate-limit";
import { logAuditAction } from "../middleware/auth-utils";
import { buildOtpauthUri, generateSecret, verifyTOTP } from "../lib/totp";
import { establishAdminSession } from "../lib/session-security";
import { ENV_SUPERADMIN_USERNAME } from "../lib/superadmin-credentials";
import {
  ENV_SUPERADMIN_ID,
  envTwoFactorActive,
  isEnvTwoFactorDisabledByEnv,
  readEnvSuperadminTwoFactor,
  resolveTwoFactorAccount,
} from "../lib/two-factor-account";
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

const codeSchema = z.object({
  code: z.string().regex(/^\d{6}$/, "El código debe tener 6 dígitos"),
});

const twoFactorLoginSchema = z.object({
  userId: z.number(),
  code: z.string().regex(/^\d{6}$/, "El código debe tener 6 dígitos"),
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
 * Resuelve el reto de 2FA a partir del `userId` que devolvió el paso 1. Cubre las
 * DOS formas de superadministrador: una fila de `admin_users` y el superadmin de
 * respaldo por variables de entorno (`id: 0`), cuyo secreto vive en
 * `env_superadmin_2fa`. Devuelve `null` si la cuenta no existe, está inactiva o
 * no tiene 2FA: en todos esos casos la respuesta es el mismo 401 genérico, para
 * no revelar el estado de una cuenta.
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

// ─── POST /admin/2fa/login — paso 2 del login (contraseña OK + 2FA activo) ───
router.post("/admin/2fa/login", loginLimiter, async (req, res) => {
  const parsed = twoFactorLoginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "validation_error", message: "userId y código de 6 dígitos requeridos" });
  }
  const { userId, code } = parsed.data;

  // Bloqueo anti fuerza bruta: el check va ANTES de tocar la DB (el body trae
  // userId). La clave incluye el ORIGEN de la petición (SEC-03): sin él,
  // cualquiera podía enviar códigos inválidos para un administrador desde
  // cualquier parte y dejar esa cuenta sin poder entrar 15 minutos,
  // repitiéndolo indefinidamente. El contador solo se incrementa con usuarios
  // reales verificados en DB, así un atacante no puede ensuciar el store con
  // userIds inexistentes.
  const lockoutKeyForRequest = lockoutKey(ipOf(req), userId);
  const lockoutMs = getLockoutRemainingMs(lockoutKeyForRequest);
  if (lockoutMs > 0) {
    req.log?.warn({ userId }, "2FA login blocked: origin temporarily locked");
    return res.status(429).json({
      error: "too_many_attempts",
      message: `Demasiados intentos fallidos de 2FA. Intenta de nuevo en ${Math.max(1, Math.ceil(lockoutMs / 60000))} minuto(s).`,
      retryAfterSeconds: Math.ceil(lockoutMs / 1000),
    });
  }

  try {
    const challenge = await resolveLoginChallenge(userId);
    if (!challenge) {
      return res.status(401).json({ error: "unauthorized", message: "Código incorrecto" });
    }

    if (!verifyTOTP(challenge.secret, code)) {
      await logAuditAction({
        userId: challenge.id,
        username: challenge.username,
        action: "LOGIN_2FA_FAILED",
        resource: "admin_users",
        ipAddress: ipOf(req),
        userAgent: uaOf(req),
        details: { reason: "invalid_totp", envAccount: challenge.isEnvAccount },
      });

      const { locked, remainingMs } = registerFailedAttempt(lockoutKeyForRequest);
      if (locked) {
        await logAuditAction({
          userId: challenge.id,
          username: challenge.username,
          action: "LOGIN_2FA_LOCKED",
          resource: "admin_users",
          ipAddress: ipOf(req),
          userAgent: uaOf(req),
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
      ipAddress: ipOf(req),
      userAgent: uaOf(req),
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
router.post("/admin/2fa/setup", requireAdmin, adminActionLimiter, async (req, res) => {
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

    await logAuditAction({
      userId: account.id,
      username: account.username,
      action: "TWO_FACTOR_SETUP",
      resource: "admin_users",
      ipAddress: ipOf(req),
      userAgent: uaOf(req),
      details: { generated: true, envAccount: account.isEnvAccount },
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
router.post("/admin/2fa/verify", requireAdmin, adminActionLimiter, async (req, res) => {
  const parsed = codeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "validation_error", message: "Código de 6 dígitos requerido" });
  const { code } = parsed.data;
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

    if (!verifyTOTP(state.secret, code)) {
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

    await logAuditAction({
      userId: account.id,
      username: account.username,
      action: "TWO_FACTOR_ENABLED",
      resource: "admin_users",
      ipAddress: ipOf(req),
      userAgent: uaOf(req),
      details: { enabled: true, envAccount: account.isEnvAccount },
    });

    return res.json({ success: true, message: "2FA activado correctamente" });
  } catch (err) {
    req.log.error({ err }, "2FA verify failed");
    return res.status(500).json({ error: "server_error", message: "Error al verificar el código" });
  }
});

// ─── POST /admin/2fa/disable — desactiva 2FA del usuario logueado ─────────────
router.post("/admin/2fa/disable", requireAdmin, adminActionLimiter, async (req, res) => {
  const parsed = codeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "validation_error", message: "Código de 6 dígitos requerido" });
  const { code } = parsed.data;
  const admin = req.session.adminUser;
  if (!admin) return res.status(401).json({ error: "unauthorized", message: "Sesión no autenticada" });

  try {
    const account = await resolveTwoFactorAccount(admin);
    if (!account) return res.status(404).json({ error: "not_found", message: "Usuario no encontrado" });
    const state = await account.state();
    if (!state.secret || !state.enabled) {
      return res.status(400).json({ error: "validation_error", message: "2FA no está activo" });
    }

    if (!verifyTOTP(state.secret, code)) {
      await logAuditAction({
        userId: account.id,
        username: account.username,
        action: "TWO_FACTOR_DISABLE_FAILED",
        resource: "admin_users",
        ipAddress: ipOf(req),
        userAgent: uaOf(req),
        details: { reason: "invalid_totp", envAccount: account.isEnvAccount },
      });
      return res.status(401).json({ error: "unauthorized", message: "Código incorrecto" });
    }

    await account.clear();

    // Al desactivar 2FA con código válido se reinicia el contador de lockout de
    // la cuenta en TODOS los orígenes (la clave es compuesta).
    clearFailedAttemptsForUser(account.id);

    await logAuditAction({
      userId: account.id,
      username: account.username,
      action: "TWO_FACTOR_DISABLED",
      resource: "admin_users",
      ipAddress: ipOf(req),
      userAgent: uaOf(req),
      details: { enabled: false, envAccount: account.isEnvAccount },
    });

    return res.json({ success: true, message: "2FA desactivado" });
  } catch (err) {
    req.log.error({ err }, "2FA disable failed");
    return res.status(500).json({ error: "server_error", message: "Error al desactivar 2FA" });
  }
});

// ─── POST /admin/users/:id/2fa/reset — escape hatch: superadmin desactiva 2FA ─
router.post("/admin/users/:id/2fa/reset", requireAdmin, adminActionLimiter, async (req, res) => {
  const admin = req.session.adminUser;
  const isSuper = admin && (admin.role === "superadmin" || admin.id === 0);
  if (!isSuper) return res.status(403).json({ error: "Solo superadmin" });

  const userId = Number(req.params.id);
  try {
    const [updated] = await db
      .update(adminUsersTable)
      .set({ twoFactorSecret: null, twoFactorEnabled: false })
      .where(eq(adminUsersTable.id, userId))
      .returning({ id: adminUsersTable.id, username: adminUsersTable.username });
    if (!updated) return res.status(404).json({ error: "not_found", message: "Usuario no encontrado" });

    // El escape hatch también desbloquea la cuenta: como la clave es compuesta
    // (origen + cuenta), hay que limpiar las entradas de todos los orígenes.
    clearFailedAttemptsForUser(userId);

    await logAuditAction({
      userId: admin?.id ?? null,
      username: admin?.username ?? null,
      action: "TWO_FACTOR_RESET",
      resource: "admin_users",
      resourceId: userId.toString(),
      ipAddress: ipOf(req),
      userAgent: uaOf(req),
      details: { targetUserId: userId, targetUsername: updated.username },
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

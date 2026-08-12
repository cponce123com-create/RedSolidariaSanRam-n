import { Router, type IRouter } from "express";
import { z } from "zod";
import { db, adminUsersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAdmin } from "../middleware/require-admin";
import { adminActionLimiter, loginLimiter } from "../middleware/rate-limit";
import { logAuditAction } from "../middleware/auth-utils";
import { buildOtpauthUri, generateSecret, verifyTOTP } from "../lib/totp";
import {
  clearFailedAttempts,
  getLockoutRemainingMs,
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

// ─── POST /admin/2fa/login — paso 2 del login (contraseña OK + 2FA activo) ───
router.post("/admin/2fa/login", loginLimiter, async (req, res) => {
  const parsed = twoFactorLoginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "validation_error", message: "userId y código de 6 dígitos requeridos" });
  }
  const { userId, code } = parsed.data;

  // Bloqueo anti fuerza bruta: el check va ANTES de tocar la DB (el body trae
  // userId). El contador solo se incrementa con usuarios reales verificados en
  // DB, así un atacante no puede ensuciar el store con userIds inexistentes.
  const lockoutMs = getLockoutRemainingMs(userId);
  if (lockoutMs > 0) {
    req.log?.warn({ userId }, "2FA login blocked: account temporarily locked");
    return res.status(429).json({
      error: "too_many_attempts",
      message: `Demasiados intentos fallidos de 2FA. Intenta de nuevo en ${Math.max(1, Math.ceil(lockoutMs / 60000))} minuto(s).`,
      retryAfterSeconds: Math.ceil(lockoutMs / 1000),
    });
  }

  try {
    const [user] = await db.select().from(adminUsersTable).where(eq(adminUsersTable.id, userId));
    if (!user || !user.active || !user.twoFactorEnabled || !user.twoFactorSecret) {
      return res.status(401).json({ error: "unauthorized", message: "Código incorrecto" });
    }

    if (!verifyTOTP(user.twoFactorSecret, code)) {
      await logAuditAction({
        userId: user.id,
        username: user.username,
        action: "LOGIN_2FA_FAILED",
        resource: "admin_users",
        ipAddress: ipOf(req),
        userAgent: uaOf(req),
        details: { reason: "invalid_totp" },
      });

      const { locked, remainingMs } = registerFailedAttempt(user.id);
      if (locked) {
        await logAuditAction({
          userId: user.id,
          username: user.username,
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

    clearFailedAttempts(user.id);
    await db.update(adminUsersTable).set({ lastLoginAt: new Date() }).where(eq(adminUsersTable.id, user.id));

    (req.session as any).adminUser = {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
    };

    await logAuditAction({
      userId: user.id,
      username: user.username,
      action: "LOGIN",
      resource: "admin_users",
      ipAddress: ipOf(req),
      userAgent: uaOf(req),
      details: { success: true, twoFactor: true },
    });

    return res.json({
      success: true,
      message: "Login exitoso",
      user: { id: user.id, username: user.username, name: user.name, role: user.role },
    });
  } catch (err) {
    req.log.error({ err }, "2FA login failed");
    return res.status(500).json({ error: "server_error", message: "Error al verificar el código" });
  }
});

// ─── POST /admin/2fa/setup — genera un secreto para el usuario logueado ───────
router.post("/admin/2fa/setup", requireAdmin, adminActionLimiter, async (req, res) => {
  const admin = (req.session as any).adminUser;
  try {
    const [user] = await db.select().from(adminUsersTable).where(eq(adminUsersTable.id, admin.id));
    if (!user) return res.status(404).json({ error: "not_found", message: "Usuario no encontrado" });
    if (user.twoFactorEnabled) {
      return res.status(400).json({ error: "validation_error", message: "2FA ya está activo. Desactívalo primero para regenerar el secreto." });
    }

    const secret = generateSecret();
    await db.update(adminUsersTable).set({ twoFactorSecret: secret }).where(eq(adminUsersTable.id, user.id));

    await logAuditAction({
      userId: user.id,
      username: user.username,
      action: "TWO_FACTOR_SETUP",
      resource: "admin_users",
      ipAddress: ipOf(req),
      userAgent: uaOf(req),
      details: { generated: true },
    });

    return res.json({
      secret,
      otpauthUri: buildOtpauthUri(secret, user.username, ISSUER),
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
  const admin = (req.session as any).adminUser;

  try {
    const [user] = await db.select().from(adminUsersTable).where(eq(adminUsersTable.id, admin.id));
    if (!user || !user.twoFactorSecret) {
      return res.status(400).json({ error: "validation_error", message: "Primero genera el secreto (setup)" });
    }
    if (user.twoFactorEnabled) {
      return res.status(400).json({ error: "validation_error", message: "2FA ya está activo" });
    }

    if (!verifyTOTP(user.twoFactorSecret, code)) {
      await logAuditAction({
        userId: user.id,
        username: user.username,
        action: "TWO_FACTOR_VERIFY_FAILED",
        resource: "admin_users",
        ipAddress: ipOf(req),
        userAgent: uaOf(req),
        details: { reason: "invalid_totp" },
      });
      return res.status(401).json({ error: "unauthorized", message: "Código incorrecto" });
    }

    await db.update(adminUsersTable).set({ twoFactorEnabled: true }).where(eq(adminUsersTable.id, user.id));

    await logAuditAction({
      userId: user.id,
      username: user.username,
      action: "TWO_FACTOR_ENABLED",
      resource: "admin_users",
      ipAddress: ipOf(req),
      userAgent: uaOf(req),
      details: { enabled: true },
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
  const admin = (req.session as any).adminUser;

  try {
    const [user] = await db.select().from(adminUsersTable).where(eq(adminUsersTable.id, admin.id));
    if (!user || !user.twoFactorSecret || !user.twoFactorEnabled) {
      return res.status(400).json({ error: "validation_error", message: "2FA no está activo" });
    }

    if (!verifyTOTP(user.twoFactorSecret, code)) {
      await logAuditAction({
        userId: user.id,
        username: user.username,
        action: "TWO_FACTOR_DISABLE_FAILED",
        resource: "admin_users",
        ipAddress: ipOf(req),
        userAgent: uaOf(req),
        details: { reason: "invalid_totp" },
      });
      return res.status(401).json({ error: "unauthorized", message: "Código incorrecto" });
    }

    await db.update(adminUsersTable).set({ twoFactorSecret: null, twoFactorEnabled: false }).where(eq(adminUsersTable.id, user.id));

    // Al desactivar 2FA con código válido se reinicia el contador de lockout.
    clearFailedAttempts(user.id);

    await logAuditAction({
      userId: user.id,
      username: user.username,
      action: "TWO_FACTOR_DISABLED",
      resource: "admin_users",
      ipAddress: ipOf(req),
      userAgent: uaOf(req),
      details: { enabled: false },
    });

    return res.json({ success: true, message: "2FA desactivado" });
  } catch (err) {
    req.log.error({ err }, "2FA disable failed");
    return res.status(500).json({ error: "server_error", message: "Error al desactivar 2FA" });
  }
});

// ─── POST /admin/users/:id/2fa/reset — escape hatch: superadmin desactiva 2FA ─
router.post("/admin/users/:id/2fa/reset", requireAdmin, adminActionLimiter, async (req, res) => {
  const admin = (req.session as any).adminUser;
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

    // El escape hatch también desbloquea la cuenta (limpieza del lockout).
    clearFailedAttempts(userId);

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
  const admin = (_req.session as any).adminUser;
  try {
    const [user] = await db
      .select({ twoFactorEnabled: adminUsersTable.twoFactorEnabled })
      .from(adminUsersTable)
      .where(eq(adminUsersTable.id, admin.id));
    if (!user) return res.status(404).json({ error: "not_found", message: "Usuario no encontrado" });
    return res.json({ enabled: user.twoFactorEnabled });
  } catch (err) {
    _req.log.error({ err }, "2FA status failed");
    return res.status(500).json({ error: "server_error", message: "Error al consultar 2FA" });
  }
});

export default router;

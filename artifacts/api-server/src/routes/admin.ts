import { Router, type IRouter } from "express";
import { z } from "zod";
import { db, adminUsersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { hashPassword, verifyPassword, logAuditAction } from "../middleware/auth-utils";
import { loginLimiter } from "../middleware/rate-limit";
import {
  isEnvSuperadminUsername,
  verifyEnvSuperadminPassword,
} from "../lib/superadmin-credentials";
import {
  ENV_SUPERADMIN_ID,
  envSuperadminTwoFactorRequired,
} from "../lib/two-factor-account";
import { establishAdminSession } from "../lib/session-security";

const router: IRouter = Router();

const loginSchema = z.object({
  username: z.string(),
  password: z.string(),
});

// Hash dummy precalculado al arrancar el módulo (NO por request): se compara
// contra él cuando el flujo del login llegaría al 401 sin haber ejecutado un
// compare real (usuario inexistente o inactivo). Así el tiempo de respuesta no
// delata si un username existe en el sistema (anti enumeración por timing).
// El resultado de esta comparación siempre se descarta.
const dummyPasswordHash = await hashPassword("red-solidaria-dummy-timing");

router.post("/admin/login", loginLimiter, async (req, res) => {
  try {
    const { username, password } = loginSchema.parse(req.body);

    // Try DB users first
    const dbUsers = await db.select().from(adminUsersTable).where(eq(adminUsersTable.username, username));
    const dbUser = dbUsers[0];

    if (dbUser && dbUser.active) {
      // Verificar contraseña hasheada
      const isValid = await verifyPassword(password, dbUser.password);
      
      if (isValid) {
        // 2FA activo: exigir el código TOTP antes de abrir la sesión (paso 2).
        // Se devuelve el userId para completar el login en /admin/2fa/login.
        if (dbUser.twoFactorEnabled && dbUser.twoFactorSecret) {
          await logAuditAction({
            userId: dbUser.id,
            username: dbUser.username,
            action: "LOGIN_2FA_PENDING",
            resource: "admin_users",
            ipAddress: req.ip || req.connection?.remoteAddress || null,
            userAgent: req.get("user-agent") || null,
            details: { success: true },
          });
          return res.json({
            success: false,
            twoFactorRequired: true,
            userId: dbUser.id,
            message: "Se requiere el código de verificación",
          });
        }

        // Actualizar último login
        await db.update(adminUsersTable)
          .set({ lastLoginAt: new Date() })
          .where(eq(adminUsersTable.id, dbUser.id));
        
        await establishAdminSession(req, {
          id: dbUser.id,
          username: dbUser.username,
          name: dbUser.name,
          role: dbUser.role,
        });
        
        // Audit log
        await logAuditAction({
          userId: dbUser.id,
          username: dbUser.username,
          action: "LOGIN",
          resource: "admin_users",
          ipAddress: req.ip || req.connection?.remoteAddress || null,
          userAgent: req.get("user-agent") || null,
          details: { success: true },
        });
        
        return res.json({ success: true, message: "Login exitoso", user: { id: dbUser.id, username: dbUser.username, name: dbUser.name, role: dbUser.role } });
      } else {
        // Audit log para intento fallido
        await logAuditAction({
          userId: dbUser.id,
          username: dbUser.username,
          action: "LOGIN_FAILED",
          resource: "admin_users",
          ipAddress: req.ip || req.connection?.remoteAddress || null,
          userAgent: req.get("user-agent") || null,
          details: { reason: "invalid_password" },
        });
      }
    }

    // Fall back to env var superadmin (solo si no existe en DB)
    if (!dbUser && isEnvSuperadminUsername(username)) {
      const isValid = await verifyEnvSuperadminPassword(password);
      
      if (isValid) {
        // 2FA del superadmin de respaldo (migración 028): su secreto no cabe en
        // `admin_users` (no tiene fila), así que vive en `env_superadmin_2fa`.
        // Antes esta cuenta quedaba SIEMPRE solo con contraseña y, como app.ts
        // exige sus variables en producción, el panel tenía una entrada sin
        // segundo factor. Se devuelve el mismo contrato que el flujo de tabla
        // (`twoFactorRequired` + userId) para que el paso 2 sea el mismo.
        if (await envSuperadminTwoFactorRequired()) {
          await logAuditAction({
            userId: 0,
            username,
            action: "LOGIN_2FA_PENDING",
            resource: "admin_users",
            ipAddress: req.ip || req.connection?.remoteAddress || null,
            userAgent: req.get("user-agent") || null,
            details: { success: true, source: "env_superadmin" },
          });
          return res.json({
            success: false,
            twoFactorRequired: true,
            userId: ENV_SUPERADMIN_ID,
            message: "Se requiere el código de verificación",
          });
        }

        const user = { id: ENV_SUPERADMIN_ID, username, name: "Superadmin", role: "superadmin" };
        await establishAdminSession(req, user);
        
        // Audit log
        await logAuditAction({
          userId: 0,
          username,
          action: "LOGIN",
          resource: "admin_users",
          ipAddress: req.ip || req.connection?.remoteAddress || null,
          userAgent: req.get("user-agent") || null,
          details: { success: true, source: "env_superadmin" },
        });
        
        return res.json({ success: true, message: "Login exitoso", user });
      } else {
        // Audit log para intento fallido
        await logAuditAction({
          userId: 0,
          username,
          action: "LOGIN_FAILED",
          resource: "admin_users",
          ipAddress: req.ip || req.connection?.remoteAddress || null,
          userAgent: req.get("user-agent") || null,
          details: { reason: "invalid_password", source: "env_superadmin" },
        });
      }
    }

    // Anti enumeración por timing: los flujos que llegan al 401 sin haber
    // ejecutado un compare real (usuario inexistente o inactivo — salvo el
    // match con el superadmin, que ya comparó arriba) corren un compare contra
    // el hash dummy precalculado; el resultado se descarta y la respuesta
    // sigue siendo 401, pero el tiempo ya no distingue usernames válidos.
    if ((!dbUser || !dbUser.active) && !(isEnvSuperadminUsername(username) && !dbUser)) {
      await verifyPassword(password, dummyPasswordHash);
    }

    return res.status(401).json({ error: "unauthorized", message: "Usuario o contraseña incorrectos" });
  } catch (err) {
    // API-06: un dato de login mal formado es 400; un fallo del servidor es 500.
    // Antes TODO se respondía como 400, así que una caída de la base parecía un
    // error del usuario y nadie veía la señal de 500.
    if (err instanceof Error && err.name === "ZodError") {
      return res.status(400).json({ error: "validation_error", message: "Invalid login data" });
    }
    req.log.error({ err }, "Login error");
    return res.status(500).json({ error: "server_error", message: "No se pudo iniciar sesión." });
  }
});

router.post("/admin/logout", async (req, res) => {
  const adminUser = req.session.adminUser;
  
  // Audit log para logout
  if (adminUser) {
    await logAuditAction({
      userId: adminUser.id,
      username: adminUser.username,
      action: "LOGOUT",
      resource: "admin_users",
      ipAddress: req.ip || req.connection?.remoteAddress || null,
      userAgent: req.get("user-agent") || null,
      details: { success: true },
    });
  }
  
  req.session.adminUser = null;
  req.session.destroy(() => {
    res.json({ success: true, message: "Sesión cerrada" });
  });
});

router.get("/admin/me", (req, res) => {
  const adminUser = req.session.adminUser;
  if (!adminUser) return res.status(401).json({ error: "unauthorized", message: "No autenticado" });
  return res.json(adminUser);
});

export default router;

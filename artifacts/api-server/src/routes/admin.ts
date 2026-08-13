import { Router, type IRouter } from "express";
import { z } from "zod";
import { db, adminUsersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { hashPassword, verifyPassword, logAuditAction } from "../middleware/auth-utils";
import { loginLimiter } from "../middleware/rate-limit";
import { logger } from "../lib/logger";
import { generateRandomPassword } from "../lib/random-password";

const router: IRouter = Router();

// El superadmin de respaldo (env var) no tiene credenciales por defecto: en
// desarrollo local, si faltan ADMIN_USERNAME/ADMIN_PASSWORD se generan
// aleatoriamente al arrancar y se imprimen en consola. En cualquier otro
// entorno app.ts exige ambas variables, así el fallback nunca queda activo en
// staging/producción.
const isDev = process.env.NODE_ENV === "development";
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || (isDev ? "admin" : "");
const ADMIN_PASSWORD =
  process.env.ADMIN_PASSWORD || (isDev ? generateRandomPassword() : "");

if (isDev && !process.env.ADMIN_PASSWORD) {
  logger.warn(
    { username: ADMIN_USERNAME },
    `Superadmin de desarrollo: ${ADMIN_USERNAME} / ${ADMIN_PASSWORD} — contraseña generada aleatoriamente. Define ADMIN_PASSWORD para fijarla.`,
  );
}

const loginSchema = z.object({
  username: z.string(),
  password: z.string(),
});

// Inicializar superadmin con contraseña hasheada (solo para desarrollo)
let superAdminHashedPassword: string | null = null;

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
        
        (req.session as any).adminUser = {
          id: dbUser.id,
          username: dbUser.username,
          name: dbUser.name,
          role: dbUser.role,
        };
        
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
    if (!dbUser && username === ADMIN_USERNAME) {
      // Hashear la contraseña del superadmin la primera vez
      if (!superAdminHashedPassword) {
        superAdminHashedPassword = await hashPassword(ADMIN_PASSWORD);
      }
      
      const isValid = await verifyPassword(password, superAdminHashedPassword);
      
      if (isValid) {
        const user = { id: 0, username, name: "Superadmin", role: "superadmin" };
        (req.session as any).adminUser = user;
        
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
    if ((!dbUser || !dbUser.active) && !(username === ADMIN_USERNAME && !dbUser)) {
      await verifyPassword(password, dummyPasswordHash);
    }

    return res.status(401).json({ error: "unauthorized", message: "Usuario o contraseña incorrectos" });
  } catch (err) {
    req.log.error({ err }, "Login error");
    return res.status(400).json({ error: "validation_error", message: "Invalid login data" });
  }
});

router.post("/admin/logout", async (req, res) => {
  const adminUser = (req.session as any).adminUser;
  
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
  
  (req.session as any).adminUser = null;
  req.session.destroy(() => {
    res.json({ success: true, message: "Sesión cerrada" });
  });
});

router.get("/admin/me", (req, res) => {
  const adminUser = (req.session as any).adminUser;
  if (!adminUser) return res.status(401).json({ error: "unauthorized", message: "No autenticado" });
  return res.json(adminUser);
});

export default router;

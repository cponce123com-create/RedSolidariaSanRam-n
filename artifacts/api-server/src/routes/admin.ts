import { Router, type IRouter } from "express";
import { z } from "zod";
import { db, adminUsersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { hashPassword, verifyPassword, logAuditAction } from "../middleware/auth-utils";
import { loginLimiter } from "../middleware/rate-limit";

const router: IRouter = Router();

// El superadmin de respaldo (env var) solo permite credenciales por defecto en
// desarrollo local. En cualquier otro entorno app.ts exige ADMIN_USERNAME y
// ADMIN_PASSWORD, así el fallback nunca queda activo en staging/producción.
const isDev = process.env.NODE_ENV === "development";
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || (isDev ? "admin" : "");
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || (isDev ? "redsolidaria2024" : "");

const loginSchema = z.object({
  username: z.string(),
  password: z.string(),
});

// Inicializar superadmin con contraseña hasheada (solo para desarrollo)
let superAdminHashedPassword: string | null = null;

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

    return res.status(401).json({ error: "unauthorized", message: "Usuario o contraseña incorrectos" });
  } catch (err) {
    console.error("Login error:", err);
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

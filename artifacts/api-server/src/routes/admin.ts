import { Router, type IRouter } from "express";
import { z } from "zod";
import { db, adminUsersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "redsolidaria2024";

const loginSchema = z.object({
  username: z.string(),
  password: z.string(),
});

router.post("/admin/login", async (req, res) => {
  try {
    const { username, password } = loginSchema.parse(req.body);

    // Try DB users first
    const dbUsers = await db.select().from(adminUsersTable).where(eq(adminUsersTable.username, username));
    const dbUser = dbUsers[0];

    if (dbUser && dbUser.active && dbUser.password === password) {
      (req.session as any).adminUser = {
        id: dbUser.id,
        username: dbUser.username,
        name: dbUser.name,
        role: dbUser.role,
      };
      return res.json({ success: true, message: "Login exitoso", user: { id: dbUser.id, username: dbUser.username, name: dbUser.name, role: dbUser.role } });
    }

    // Fall back to env var superadmin
    if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
      const user = { id: 0, username, name: "Superadmin", role: "superadmin" };
      (req.session as any).adminUser = user;
      return res.json({ success: true, message: "Login exitoso", user });
    }

    return res.status(401).json({ error: "unauthorized", message: "Usuario o contraseña incorrectos" });
  } catch (err) {
    res.status(400).json({ error: "validation_error", message: "Invalid login data" });
  }
});

router.post("/admin/logout", (req, res) => {
  (req.session as any).adminUser = null;
  req.session.destroy(() => {
    res.json({ success: true, message: "Sesión cerrada" });
  });
});

router.get("/admin/me", (req, res) => {
  const adminUser = (req.session as any).adminUser;
  if (!adminUser) return res.status(401).json({ error: "unauthorized", message: "No autenticado" });
  res.json(adminUser);
});

export default router;

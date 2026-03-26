import { Router, type IRouter } from "express";
import { z } from "zod";

const router: IRouter = Router();

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "redsolidaria2024";

const loginSchema = z.object({
  username: z.string(),
  password: z.string(),
});

router.post("/admin/login", (req, res) => {
  try {
    const { username, password } = loginSchema.parse(req.body);
    if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
      (req.session as any).adminUser = { id: 1, username };
      res.json({
        success: true,
        message: "Login exitoso",
        user: { id: 1, username },
      });
    } else {
      res.status(401).json({
        error: "unauthorized",
        message: "Usuario o contraseña incorrectos",
      });
    }
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
  if (!adminUser) {
    return res.status(401).json({ error: "unauthorized", message: "No autenticado" });
  }
  res.json(adminUser);
});

export default router;

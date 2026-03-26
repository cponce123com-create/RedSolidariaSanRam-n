import { Router } from "express";
import { db, adminUsersTable, insertAdminUserSchema } from "@workspace/db";
import { eq, ne } from "drizzle-orm";

const router = Router();

function isSuperAdmin(req: any) {
  const user = req.session?.adminUser;
  return user && (user.role === "superadmin" || user.id === 0);
}

// ─── List all admin users ────────────────────────────────────────────────────
router.get("/admin/users", async (req, res) => {
  if (!isSuperAdmin(req)) return res.status(403).json({ error: "Solo superadmin puede ver usuarios" });
  const users = await db.select({
    id: adminUsersTable.id,
    username: adminUsersTable.username,
    role: adminUsersTable.role,
    name: adminUsersTable.name,
    email: adminUsersTable.email,
    active: adminUsersTable.active,
    createdAt: adminUsersTable.createdAt,
  }).from(adminUsersTable);
  res.json(users);
});

// ─── Create admin user ───────────────────────────────────────────────────────
router.post("/admin/users", async (req, res) => {
  if (!isSuperAdmin(req)) return res.status(403).json({ error: "Solo superadmin" });
  const parsed = insertAdminUserSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Datos inválidos", details: parsed.error.issues });
  try {
    const [user] = await db.insert(adminUsersTable).values(parsed.data).returning({
      id: adminUsersTable.id, username: adminUsersTable.username,
      role: adminUsersTable.role, name: adminUsersTable.name,
      email: adminUsersTable.email, active: adminUsersTable.active,
    });
    res.status(201).json(user);
  } catch (e: any) {
    if (e.code === "23505") return res.status(400).json({ error: "El nombre de usuario ya existe" });
    throw e;
  }
});

// ─── Update admin user ───────────────────────────────────────────────────────
router.patch("/admin/users/:id", async (req, res) => {
  if (!isSuperAdmin(req)) return res.status(403).json({ error: "Solo superadmin" });
  const { password, ...safeFields } = req.body;
  const updateData = password ? { ...safeFields, password } : safeFields;
  const [updated] = await db.update(adminUsersTable).set(updateData).where(eq(adminUsersTable.id, Number(req.params.id))).returning({
    id: adminUsersTable.id, username: adminUsersTable.username,
    role: adminUsersTable.role, name: adminUsersTable.name,
    email: adminUsersTable.email, active: adminUsersTable.active,
  });
  if (!updated) return res.status(404).json({ error: "Usuario no encontrado" });
  res.json(updated);
});

// ─── Delete admin user ───────────────────────────────────────────────────────
router.delete("/admin/users/:id", async (req, res) => {
  if (!isSuperAdmin(req)) return res.status(403).json({ error: "Solo superadmin" });
  await db.delete(adminUsersTable).where(eq(adminUsersTable.id, Number(req.params.id)));
  res.status(204).send();
});

export default router;

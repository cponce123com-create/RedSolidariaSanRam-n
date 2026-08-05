import { Router } from "express";
import { db, adminUsersTable, insertAdminUserSchema } from "@workspace/db";
import { eq, ne } from "drizzle-orm";
import { hashPassword, logAuditAction } from "../middleware/auth-utils";

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
    lastLoginAt: adminUsersTable.lastLoginAt,
  }).from(adminUsersTable);
  
  // Audit log
  const adminUser = req.session?.adminUser;
  await logAuditAction({
    userId: adminUser?.id || null,
    username: adminUser?.username || null,
    action: "LIST_USERS",
    resource: "admin_users",
    ipAddress: req.ip || req.connection?.remoteAddress || null,
    userAgent: req.get("user-agent") || null,
    details: { count: users.length },
  });
  
  return res.json(users);
});

// ─── Create admin user ───────────────────────────────────────────────────────
router.post("/admin/users", async (req, res) => {
  if (!isSuperAdmin(req)) return res.status(403).json({ error: "Solo superadmin" });
  const parsed = insertAdminUserSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Datos inválidos", details: parsed.error.issues });
  
  try {
    // Hashear contraseña antes de guardar
    const hashedPassword = await hashPassword(parsed.data.password);
    
    const [user] = await db.insert(adminUsersTable).values({
      ...parsed.data,
      password: hashedPassword,
      passwordChangedAt: new Date(),
    }).returning({
      id: adminUsersTable.id, username: adminUsersTable.username,
      role: adminUsersTable.role, name: adminUsersTable.name,
      email: adminUsersTable.email, active: adminUsersTable.active,
    });
    
    // Audit log
    const adminUser = req.session?.adminUser;
    await logAuditAction({
      userId: adminUser?.id || null,
      username: adminUser?.username || null,
      action: "CREATE_USER",
      resource: "admin_users",
      resourceId: user.id.toString(),
      ipAddress: req.ip || req.connection?.remoteAddress || null,
      userAgent: req.get("user-agent") || null,
      details: { createdUserId: user.id, createdUsername: user.username },
    });
    
    return res.status(201).json(user);
  } catch (e: any) {
    if (e.code === "23505") return res.status(400).json({ error: "El nombre de usuario ya existe" });
    throw e;
  }
});

// ─── Update admin user ───────────────────────────────────────────────────────
router.patch("/admin/users/:id", async (req, res) => {
  if (!isSuperAdmin(req)) return res.status(403).json({ error: "Solo superadmin" });
  const { password, ...safeFields } = req.body;
  
  let updateData: any = { ...safeFields };
  
  // Si se cambia la contraseña, hashearla y actualizar timestamp
  if (password) {
    updateData.password = await hashPassword(password);
    updateData.passwordChangedAt = new Date();
  }
  
  const userId = Number(req.params.id);
  
  // Obtener usuario antes de actualizar para audit log
  const existingUsers = await db.select().from(adminUsersTable).where(eq(adminUsersTable.id, userId));
  const existingUser = existingUsers[0];
  
  const [updated] = await db.update(adminUsersTable)
    .set(updateData)
    .where(eq(adminUsersTable.id, userId))
    .returning({
      id: adminUsersTable.id, username: adminUsersTable.username,
      role: adminUsersTable.role, name: adminUsersTable.name,
      email: adminUsersTable.email, active: adminUsersTable.active,
    });
    
  if (!updated) return res.status(404).json({ error: "Usuario no encontrado" });
  
  // Audit log
  const adminUser = req.session?.adminUser;
  await logAuditAction({
    userId: adminUser?.id || null,
    username: adminUser?.username || null,
    action: "UPDATE_USER",
    resource: "admin_users",
    resourceId: userId.toString(),
    ipAddress: req.ip || req.connection?.remoteAddress || null,
    userAgent: req.get("user-agent") || null,
    details: { 
      updatedUserId: userId,
      updatedUsername: updated.username,
      changedFields: Object.keys(safeFields),
      passwordChanged: !!password,
    },
  });
  
  return res.json(updated);
});

// ─── Delete admin user ───────────────────────────────────────────────────────
router.delete("/admin/users/:id", async (req, res) => {
  if (!isSuperAdmin(req)) return res.status(403).json({ error: "Solo superadmin" });
  
  const userId = Number(req.params.id);
  
  // Obtener usuario antes de eliminar para audit log
  const existingUsers = await db.select().from(adminUsersTable).where(eq(adminUsersTable.id, userId));
  const existingUser = existingUsers[0];
  
  if (!existingUser) {
    return res.status(404).json({ error: "Usuario no encontrado" });
  }
  
  await db.delete(adminUsersTable).where(eq(adminUsersTable.id, userId));
  
  // Audit log
  const adminUser = req.session?.adminUser;
  await logAuditAction({
    userId: adminUser?.id || null,
    username: adminUser?.username || null,
    action: "DELETE_USER",
    resource: "admin_users",
    resourceId: userId.toString(),
    ipAddress: req.ip || req.connection?.remoteAddress || null,
    userAgent: req.get("user-agent") || null,
    details: { deletedUserId: userId, deletedUsername: existingUser.username },
  });
  
  return res.status(204).send();
});

export default router;

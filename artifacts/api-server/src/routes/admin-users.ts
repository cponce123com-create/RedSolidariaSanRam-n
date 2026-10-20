import { Router } from "express";
import { db, adminUsersTable, insertAdminUserSchema } from "@workspace/db";
import { eq, ne } from "drizzle-orm";
import { hashPassword, logAuditAction } from "../middleware/auth-utils";
import {
  SUPERADMIN_ROLE,
  guardDeleteAdminUser,
  guardUpdateAdminUser,
  revokeAdminSessions,
  shouldRevokeSessions,
} from "../lib/admin-user-guards";

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

// Schema de actualización: solo campos editables del perfil admin (username,
// role, name, email, active). El password se maneja aparte (se hashea) y
// twoFactorSecret/twoFactorEnabled ni siquiera están en el schema: Zod los
// descarta silenciosamente, de modo que este endpoint genérico no puede
// desactivar/alterar el 2FA de nadie (anti mass-assignment).
export const updateAdminUserSchema = insertAdminUserSchema.omit({ password: true }).partial();

// ─── Update admin user ───────────────────────────────────────────────────────
router.patch("/admin/users/:id", async (req, res) => {
  if (!isSuperAdmin(req)) return res.status(403).json({ error: "Solo superadmin" });
  const { password, twoFactorSecret, twoFactorEnabled, ...safeBody } = req.body;
  const parsed = updateAdminUserSchema.safeParse(safeBody);
  if (!parsed.success) return res.status(400).json({ error: "Datos inválidos", details: parsed.error.issues });

  let updateData: any = { ...parsed.data };

  // Si se cambia la contraseña, hashearla y actualizar timestamp
  if (password) {
    if (typeof password !== "string" || password.length < 12) {
      return res.status(400).json({ error: "La contraseña debe tener al menos 12 caracteres" });
    }
    updateData.password = await hashPassword(password);
    updateData.passwordChangedAt = new Date();
  }
  
  const userId = Number(req.params.id);
  const actor = req.session?.adminUser ?? null;
  const changes = {
    role: parsed.data.role,
    active: parsed.data.active,
    password: !!password,
    username: parsed.data.username,
  };

  // V14-1.3: mismas guardas que en el borrado — no se puede degradar ni desactivar al
  // ÚLTIMO superadmin activo, ni desactivarse a uno mismo — y todo dentro de una
  // transacción con bloqueo para que no haya carrera entre dos peticiones.
  const outcome = await db.transaction(async (tx) => {
    const admins = await tx
      .select({
        id: adminUsersTable.id,
        username: adminUsersTable.username,
        role: adminUsersTable.role,
        active: adminUsersTable.active,
      })
      .from(adminUsersTable)
      .for("update");

    const target = admins.find((row) => row.id === userId) ?? null;
    const activeSuperadmins = admins.filter(
      (row) => row.role === SUPERADMIN_ROLE && row.active === true,
    ).length;

    const guard = guardUpdateAdminUser({
      actor: actor ? { id: actor.id, username: actor.username } : null,
      target,
      activeSuperadmins,
      changes,
    });
    if (!guard.ok) return { ok: false as const, guard };

    const [updatedRow] = await tx
      .update(adminUsersTable)
      .set(updateData)
      .where(eq(adminUsersTable.id, userId))
      .returning({
        id: adminUsersTable.id,
        username: adminUsersTable.username,
        role: adminUsersTable.role,
        name: adminUsersTable.name,
        email: adminUsersTable.email,
        active: adminUsersTable.active,
      });

    if (!updatedRow) {
      return {
        ok: false as const,
        guard: { ok: false as const, code: "not_found", message: "Usuario no encontrado.", status: 404 },
      };
    }
    return { ok: true as const, updated: updatedRow, target: target as NonNullable<typeof target> };
  });

  if (!outcome.ok) {
    return res
      .status(outcome.guard.status)
      .json({ error: outcome.guard.code, code: outcome.guard.code, message: outcome.guard.message });
  }
  const updated = outcome.updated;

  // Desactivar a alguien o cambiarle el rol debe surtir efecto YA: si no, su sesión
  // seguiría viva con los permisos antiguos hasta que caducara la cookie.
  const revocation = shouldRevokeSessions(outcome.target, changes);
  const revokedSessions = revocation.revoke ? await revokeAdminSessions(userId) : 0;

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
      changedFields: Object.keys(parsed.data),
      passwordChanged: !!password,
      previousRole: outcome.target.role,
      revokedSessions,
      revokeReason: revocation.reason,
    },
  });

  return res.json(updated);
});

// ─── Delete admin user ───────────────────────────────────────────────────────
router.delete("/admin/users/:id", async (req, res) => {
  if (!isSuperAdmin(req)) return res.status(403).json({ error: "Solo superadmin" });

  const userId = Number(req.params.id);
  const actor = req.session?.adminUser ?? null;

  // V14-1.3: las guardas van en el SERVIDOR (no en botones deshabilitados) y dentro
  // de una TRANSACCIÓN con bloqueo de filas, para que dos peticiones simultáneas no
  // puedan dejar el panel sin ningún superadministrador (condición de carrera).
  const outcome = await db.transaction(async (tx) => {
    // Se bloquean TODAS las filas de administradores (la tabla es minúscula) para
    // que el recuento y el borrado sean la misma foto.
    const admins = await tx
      .select({
        id: adminUsersTable.id,
        username: adminUsersTable.username,
        role: adminUsersTable.role,
        active: adminUsersTable.active,
      })
      .from(adminUsersTable)
      .for("update");

    const target = admins.find((row) => row.id === userId) ?? null;
    const activeSuperadmins = admins.filter(
      (row) => row.role === SUPERADMIN_ROLE && row.active === true,
    ).length;

    const guard = guardDeleteAdminUser({
      actor: actor ? { id: actor.id, username: actor.username } : null,
      target,
      activeSuperadmins,
    });
    if (!guard.ok) return { ok: false as const, guard };

    await tx.delete(adminUsersTable).where(eq(adminUsersTable.id, userId));
    return { ok: true as const, target: target as NonNullable<typeof target> };
  });

  if (!outcome.ok) {
    return res
      .status(outcome.guard.status)
      .json({ error: outcome.guard.code, code: outcome.guard.code, message: outcome.guard.message });
  }

  // Una cuenta eliminada no debe seguir navegando con su cookie: se revocan sus
  // sesiones abiertas.
  const revokedSessions = await revokeAdminSessions(userId);

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
    details: {
      deletedUserId: userId,
      deletedUsername: outcome.target.username,
      revokedSessions,
    },
  });

  return res.status(204).send();
});

export default router;

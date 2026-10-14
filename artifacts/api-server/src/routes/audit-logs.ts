import { Router, type IRouter } from "express";
import { db, auditLogsTable } from "@workspace/db";
import { and, desc, eq, ilike, type SQL } from "drizzle-orm";
import { requireAdmin } from "../middleware/require-admin";
import { requireRole, ROLES } from "../middleware/roles";
import { adminActionLimiter } from "../middleware/rate-limit";
import { toIsoSafe } from "../lib/date-format";
import { redactSensitiveDetails } from "../lib/audit";

// El registro de auditoría es PRIVADO (datos de quién hizo qué).
const adminOnly = [requireAdmin, requireRole(ROLES.ADMIN)];

const router: IRouter = Router();

/**
 * GET /admin/audit-logs — registro de auditoría consultable (privado).
 *
 * Filtros: ?action= &resource= &username= &limit= &offset=
 * Los `details` se redactan AL LEER (defensa en profundidad: nunca se devuelven
 * contraseñas, tokens ni secretos aunque se hubieran guardado por error).
 */
router.get("/admin/audit-logs", ...adminOnly, adminActionLimiter, async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 50, 1), 200);
    const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);

    const conditions: SQL[] = [];
    if (typeof req.query.action === "string" && req.query.action) {
      conditions.push(eq(auditLogsTable.action, req.query.action));
    }
    if (typeof req.query.resource === "string" && req.query.resource) {
      conditions.push(eq(auditLogsTable.resource, req.query.resource));
    }
    if (typeof req.query.username === "string" && req.query.username.trim()) {
      conditions.push(ilike(auditLogsTable.username, `%${req.query.username.trim()}%`));
    }

    const rows = await db
      .select()
      .from(auditLogsTable)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(auditLogsTable.createdAt))
      .limit(limit)
      .offset(offset);

    res.setHeader("Cache-Control", "private, no-store");
    return res.json(
      rows.map((r) => ({
        id: r.id,
        action: r.action,
        resource: r.resource,
        resourceId: r.resourceId,
        username: r.username,
        userId: r.userId,
        ipAddress: r.ipAddress,
        details: redactSensitiveDetails(r.details),
        createdAt: toIsoSafe(r.createdAt),
      })),
    );
  } catch (err) {
    req.log.error({ err }, "Failed to list audit logs");
    return res
      .status(500)
      .json({ error: "server_error", message: "No se pudo leer el registro de auditoría" });
  }
});

export default router;

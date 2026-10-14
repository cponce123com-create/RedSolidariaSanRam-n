import { Router, type IRouter } from "express";
import { db, supervisorObservationsTable } from "@workspace/db";
import { and, desc, eq, isNull, type SQL } from "drizzle-orm";
import { requireAdmin } from "../middleware/require-admin";
import { requireRole, ROLES, READ_ROLES } from "../middleware/roles";
import { adminActionLimiter } from "../middleware/rate-limit";
import { toIsoSafe } from "../lib/date-format";
import { logAuditAction } from "../middleware/auth-utils";
import { AUDIT_ACTIONS, AUDIT_RESOURCES, auditContext } from "../lib/audit";
import {
  canWriteObservation,
  observationEntityLabel,
  validateObservation,
} from "../lib/supervisor";

// Consulta de observaciones: administración y supervisión.
const readRoles = [requireAdmin, requireRole(...READ_ROLES)];
// Resolver una observación es competencia exclusiva de la administración.
const resolveRoles = [requireAdmin, requireRole(ROLES.ADMIN)];

const router: IRouter = Router();

interface ObservationRow {
  id: number;
  entityType: string;
  entityId: string;
  body: string;
  authorUsername: string | null;
  resolvedAt: Date | null;
  resolvedBy: string | null;
  createdAt: Date | null;
}

function formatObservation(row: ObservationRow) {
  return {
    id: row.id,
    entityType: row.entityType,
    entityLabel: observationEntityLabel(row.entityType),
    entityId: row.entityId,
    body: row.body,
    authorUsername: row.authorUsername,
    resolved: row.resolvedAt != null,
    resolvedBy: row.resolvedBy,
    resolvedAt: toIsoSafe(row.resolvedAt),
    createdAt: toIsoSafe(row.createdAt),
  };
}

/**
 * GET /admin/observations — observaciones de supervisión (privado).
 * Filtros: ?entityType= &entityId= &pending=true &limit=
 */
router.get(
  "/admin/observations",
  ...readRoles,
  adminActionLimiter,
  async (req, res) => {
    try {
      const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 100, 1), 200);
      const conditions: SQL[] = [];
      if (typeof req.query.entityType === "string" && req.query.entityType) {
        conditions.push(eq(supervisorObservationsTable.entityType, req.query.entityType));
      }
      if (typeof req.query.entityId === "string" && req.query.entityId) {
        conditions.push(eq(supervisorObservationsTable.entityId, req.query.entityId));
      }
      if (req.query.pending === "true") {
        conditions.push(isNull(supervisorObservationsTable.resolvedAt));
      }

      const rows = await db
        .select()
        .from(supervisorObservationsTable)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(supervisorObservationsTable.createdAt))
        .limit(limit);

      res.setHeader("Cache-Control", "private, no-store");
      return res.json(rows.map(formatObservation));
    } catch (err) {
      req.log.error({ err }, "Failed to list observations");
      return res
        .status(500)
        .json({ error: "server_error", message: "No se pudieron leer las observaciones" });
    }
  },
);

/**
 * POST /admin/observations — dejar una observación sobre un registro.
 *
 * Es la ÚNICA escritura permitida al supervisor: la observación es un anexo y
 * NUNCA modifica el registro observado.
 */
router.post(
  "/admin/observations",
  ...readRoles,
  adminActionLimiter,
  async (req, res) => {
    try {
      const actor = req.session?.adminUser ?? null;
      if (!canWriteObservation(actor?.role)) {
        return res.status(403).json({
          error: "forbidden",
          message: "No tienes permisos para dejar observaciones",
        });
      }

      const parsed = validateObservation({
        entityType: req.body?.entityType,
        entityId: req.body?.entityId,
        body: req.body?.body,
      });
      if (!parsed.ok) {
        return res.status(400).json({ error: "validation_error", message: parsed.message });
      }

      const [row] = await db
        .insert(supervisorObservationsTable)
        .values({
          entityType: parsed.value.entityType,
          entityId: parsed.value.entityId,
          body: parsed.value.body,
          authorId: actor ? String(actor.id) : null,
          authorUsername: actor?.username ?? null,
        })
        .returning();

      await logAuditAction({
        ...auditContext(req),
        action: AUDIT_ACTIONS.observationCreated,
        resource: AUDIT_RESOURCES.observations,
        resourceId: String(row.id),
        details: { entityType: row.entityType, entityId: row.entityId },
      });

      return res.status(201).json(formatObservation(row));
    } catch (err) {
      req.log.error({ err }, "Failed to create observation");
      return res
        .status(500)
        .json({ error: "server_error", message: "No se pudo registrar la observación" });
    }
  },
);

/**
 * PATCH /admin/observations/:id/resolve — marcar como atendida (administración).
 * La resolución queda registrada con quién y cuándo.
 */
router.patch(
  "/admin/observations/:id/resolve",
  ...resolveRoles,
  adminActionLimiter,
  async (req, res) => {
    try {
      const id = Number.parseInt(String(req.params.id ?? ""), 10);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ error: "validation_error", message: "ID inválido." });
      }

      const actor = req.session?.adminUser ?? null;
      const [row] = await db
        .update(supervisorObservationsTable)
        .set({ resolvedAt: new Date(), resolvedBy: actor?.username ?? null })
        .where(
          and(
            eq(supervisorObservationsTable.id, id),
            isNull(supervisorObservationsTable.resolvedAt),
          ),
        )
        .returning();

      if (!row) {
        return res.status(409).json({
          error: "conflict",
          message: "La observación no existe o ya estaba atendida.",
        });
      }

      await logAuditAction({
        ...auditContext(req),
        action: AUDIT_ACTIONS.observationResolved,
        resource: AUDIT_RESOURCES.observations,
        resourceId: String(row.id),
        details: { entityType: row.entityType, entityId: row.entityId },
      });

      return res.json(formatObservation(row));
    } catch (err) {
      req.log.error({ err }, "Failed to resolve observation");
      return res
        .status(500)
        .json({ error: "server_error", message: "No se pudo resolver la observación" });
    }
  },
);

export default router;

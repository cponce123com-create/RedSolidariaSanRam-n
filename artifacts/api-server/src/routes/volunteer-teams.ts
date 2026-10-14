import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  volunteersTable,
  volunteerTeamsTable,
  volunteerTeamMembersTable,
  volunteerParticipationsTable,
} from "@workspace/db/schema";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { toIsoSafe } from "../lib/date-format";
import { adminActionLimiter } from "../middleware/rate-limit";
import { requireAdmin } from "../middleware/require-admin";
import { requireRole, ROLES } from "../middleware/roles";
import { logAuditAction } from "../middleware/auth-utils";
import { AUDIT_ACTIONS, AUDIT_RESOURCES, auditContext } from "../lib/audit";
import { hasPgErrorCode } from "../lib/pg-errors";
import {
  activityTypeLabel,
  summarizeParticipation,
  validateParticipation,
  validateTeam,
} from "../lib/volunteer-teams";

// Comunidad: equipos y participación los gestionan administración Y moderadores.
const communityRoles = [requireAdmin, requireRole(ROLES.ADMIN, ROLES.MODERATOR)];

const router: IRouter = Router();

const MAX_PARTICIPATIONS = 500;

function parseId(value: unknown): number | null {
  const n = Number.parseInt(String(value ?? ""), 10);
  return Number.isInteger(n) && n > 0 ? n : null;
}

async function volunteerExists(id: number): Promise<boolean> {
  const [row] = await db
    .select({ id: volunteersTable.id })
    .from(volunteersTable)
    .where(eq(volunteersTable.id, id))
    .limit(1);
  return Boolean(row);
}

function formatTeam(row: {
  id: number;
  name: string;
  description: string | null;
  color: string | null;
  isActive: boolean;
  createdAt: Date | null;
  activeMembers?: number;
}) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    color: row.color,
    isActive: row.isActive,
    activeMembers: row.activeMembers ?? 0,
    createdAt: toIsoSafe(row.createdAt),
  };
}

function formatParticipation(row: typeof volunteerParticipationsTable.$inferSelect) {
  return {
    id: row.id,
    campaignId: row.campaignId,
    activityType: row.activityType,
    activityLabel: activityTypeLabel(row.activityType),
    title: row.title,
    description: row.description,
    hours: row.hours === null ? null : Number(row.hours),
    participatedAt: toIsoSafe(row.participatedAt),
    recordedBy: row.recordedBy,
    createdAt: toIsoSafe(row.createdAt),
  };
}

// ─── Equipos ──────────────────────────────────────────────────────────────────

/** GET /admin/volunteer-teams — equipos con su número de miembros activos. */
router.get("/admin/volunteer-teams", ...communityRoles, adminActionLimiter, async (req, res) => {
  try {
    const rows = await db
      .select({
        id: volunteerTeamsTable.id,
        name: volunteerTeamsTable.name,
        description: volunteerTeamsTable.description,
        color: volunteerTeamsTable.color,
        isActive: volunteerTeamsTable.isActive,
        createdAt: volunteerTeamsTable.createdAt,
        activeMembers: sql<number>`count(${volunteerTeamMembersTable.id}) filter (where ${volunteerTeamMembersTable.leftAt} is null)::int`,
      })
      .from(volunteerTeamsTable)
      .leftJoin(
        volunteerTeamMembersTable,
        eq(volunteerTeamMembersTable.teamId, volunteerTeamsTable.id),
      )
      .groupBy(volunteerTeamsTable.id)
      .orderBy(volunteerTeamsTable.name);

    res.setHeader("Cache-Control", "private, no-store");
    return res.json(rows.map(formatTeam));
  } catch (err) {
    req.log.error({ err }, "Failed to list volunteer teams");
    return res
      .status(500)
      .json({ error: "server_error", message: "No se pudieron listar los equipos" });
  }
});

/** POST /admin/volunteer-teams — crear equipo. */
router.post("/admin/volunteer-teams", ...communityRoles, adminActionLimiter, async (req, res) => {
  try {
    const parsed = validateTeam({
      name: req.body?.name,
      description: req.body?.description,
      color: req.body?.color,
    });
    if (!parsed.ok) {
      return res.status(400).json({ error: "validation_error", message: parsed.message });
    }

    const [row] = await db
      .insert(volunteerTeamsTable)
      .values({ ...parsed.value, updatedAt: new Date() })
      .returning();

    return res.status(201).json(formatTeam(row));
  } catch (err) {
    if (hasPgErrorCode(err, "23505")) {
      return res
        .status(409)
        .json({ error: "duplicate", message: "Ya existe un equipo con ese nombre." });
    }
    req.log.error({ err }, "Failed to create volunteer team");
    return res
      .status(500)
      .json({ error: "server_error", message: "No se pudo crear el equipo" });
  }
});

/** PUT /admin/volunteer-teams/:id — actualizar equipo (incluye desactivarlo). */
router.put("/admin/volunteer-teams/:id", ...communityRoles, adminActionLimiter, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (id === null) {
      return res.status(400).json({ error: "validation_error", message: "ID inválido." });
    }

    const parsed = validateTeam({
      name: req.body?.name,
      description: req.body?.description,
      color: req.body?.color,
    });
    if (!parsed.ok) {
      return res.status(400).json({ error: "validation_error", message: parsed.message });
    }

    const isActive = typeof req.body?.isActive === "boolean" ? req.body.isActive : undefined;

    const [row] = await db
      .update(volunteerTeamsTable)
      .set({
        ...parsed.value,
        ...(isActive === undefined ? {} : { isActive }),
        updatedAt: new Date(),
      })
      .where(eq(volunteerTeamsTable.id, id))
      .returning();

    if (!row) {
      return res.status(404).json({ error: "not_found", message: "Equipo no encontrado." });
    }

    return res.json(formatTeam(row));
  } catch (err) {
    if (hasPgErrorCode(err, "23505")) {
      return res
        .status(409)
        .json({ error: "duplicate", message: "Ya existe un equipo con ese nombre." });
    }
    req.log.error({ err }, "Failed to update volunteer team");
    return res
      .status(500)
      .json({ error: "server_error", message: "No se pudo actualizar el equipo" });
  }
});

// ─── Pertenencia a equipos ────────────────────────────────────────────────────

/** GET /admin/volunteers/:id/teams — pertenencias (activas e históricas). */
router.get(
  "/admin/volunteers/:id/teams",
  ...communityRoles,
  adminActionLimiter,
  async (req, res) => {
    try {
      const id = parseId(req.params.id);
      if (id === null) {
        return res.status(400).json({ error: "validation_error", message: "ID inválido." });
      }

      const rows = await db
        .select({
          id: volunteerTeamMembersTable.id,
          teamId: volunteerTeamMembersTable.teamId,
          teamName: volunteerTeamsTable.name,
          color: volunteerTeamsTable.color,
          role: volunteerTeamMembersTable.role,
          joinedAt: volunteerTeamMembersTable.joinedAt,
          leftAt: volunteerTeamMembersTable.leftAt,
        })
        .from(volunteerTeamMembersTable)
        .innerJoin(
          volunteerTeamsTable,
          eq(volunteerTeamsTable.id, volunteerTeamMembersTable.teamId),
        )
        .where(eq(volunteerTeamMembersTable.volunteerId, id))
        .orderBy(desc(volunteerTeamMembersTable.joinedAt));

      res.setHeader("Cache-Control", "private, no-store");
      return res.json(
        rows.map((row) => ({
          id: row.id,
          teamId: row.teamId,
          teamName: row.teamName,
          color: row.color,
          role: row.role,
          active: row.leftAt === null,
          joinedAt: toIsoSafe(row.joinedAt),
          leftAt: toIsoSafe(row.leftAt),
        })),
      );
    } catch (err) {
      req.log.error({ err }, "Failed to list volunteer memberships");
      return res
        .status(500)
        .json({ error: "server_error", message: "No se pudieron leer los equipos del voluntario" });
    }
  },
);

/** POST /admin/volunteers/:id/teams — asignar a un equipo. */
router.post(
  "/admin/volunteers/:id/teams",
  ...communityRoles,
  adminActionLimiter,
  async (req, res) => {
    try {
      const volunteerId = parseId(req.params.id);
      const teamId = parseId(req.body?.teamId);
      if (volunteerId === null || teamId === null) {
        return res
          .status(400)
          .json({ error: "validation_error", message: "Voluntario o equipo no válido." });
      }

      if (!(await volunteerExists(volunteerId))) {
        return res
          .status(404)
          .json({ error: "not_found", message: "Voluntario no encontrado." });
      }

      const [team] = await db
        .select({ id: volunteerTeamsTable.id, isActive: volunteerTeamsTable.isActive })
        .from(volunteerTeamsTable)
        .where(eq(volunteerTeamsTable.id, teamId))
        .limit(1);
      if (!team) {
        return res.status(404).json({ error: "not_found", message: "Equipo no encontrado." });
      }
      if (!team.isActive) {
        return res
          .status(409)
          .json({ error: "conflict", message: "El equipo está desactivado." });
      }

      const role = typeof req.body?.role === "string" ? req.body.role.trim() || null : null;

      const [row] = await db
        .insert(volunteerTeamMembersTable)
        .values({ volunteerId, teamId, role })
        .returning();

      await logAuditAction({
        ...auditContext(req),
        action: AUDIT_ACTIONS.volunteerTeamAssigned,
        resource: AUDIT_RESOURCES.volunteers,
        resourceId: String(volunteerId),
        details: { teamId, role },
      });

      return res.status(201).json({
        id: row.id,
        teamId: row.teamId,
        role: row.role,
        active: true,
        joinedAt: toIsoSafe(row.joinedAt),
        leftAt: null,
      });
    } catch (err) {
      if (hasPgErrorCode(err, "23505")) {
        return res.status(409).json({
          error: "duplicate",
          message: "El voluntario ya pertenece a ese equipo.",
        });
      }
      req.log.error({ err }, "Failed to assign volunteer team");
      return res
        .status(500)
        .json({ error: "server_error", message: "No se pudo asignar el equipo" });
    }
  },
);

/**
 * PATCH /admin/volunteers/:id/teams/:memberId/leave — cerrar la pertenencia.
 * No se borra: se marca la fecha de baja para conservar el historial.
 */
router.patch(
  "/admin/volunteers/:id/teams/:memberId/leave",
  ...communityRoles,
  adminActionLimiter,
  async (req, res) => {
    try {
      const volunteerId = parseId(req.params.id);
      const memberId = parseId(req.params.memberId);
      if (volunteerId === null || memberId === null) {
        return res.status(400).json({ error: "validation_error", message: "ID inválido." });
      }

      const [row] = await db
        .update(volunteerTeamMembersTable)
        .set({ leftAt: new Date() })
        .where(
          and(
            eq(volunteerTeamMembersTable.id, memberId),
            eq(volunteerTeamMembersTable.volunteerId, volunteerId),
            isNull(volunteerTeamMembersTable.leftAt),
          ),
        )
        .returning();

      if (!row) {
        return res.status(409).json({
          error: "conflict",
          message: "La pertenencia no existe o ya estaba cerrada.",
        });
      }

      await logAuditAction({
        ...auditContext(req),
        action: AUDIT_ACTIONS.volunteerTeamLeft,
        resource: AUDIT_RESOURCES.volunteers,
        resourceId: String(volunteerId),
        details: { teamId: row.teamId },
      });

      return res.json({
        id: row.id,
        teamId: row.teamId,
        role: row.role,
        active: false,
        joinedAt: toIsoSafe(row.joinedAt),
        leftAt: toIsoSafe(row.leftAt),
      });
    } catch (err) {
      req.log.error({ err }, "Failed to close volunteer membership");
      return res
        .status(500)
        .json({ error: "server_error", message: "No se pudo cerrar la pertenencia" });
    }
  },
);

// ─── Historial de participación ───────────────────────────────────────────────

/** GET /admin/volunteers/:id/participations — historial + resumen. */
router.get(
  "/admin/volunteers/:id/participations",
  ...communityRoles,
  adminActionLimiter,
  async (req, res) => {
    try {
      const id = parseId(req.params.id);
      if (id === null) {
        return res.status(400).json({ error: "validation_error", message: "ID inválido." });
      }

      const rows = await db
        .select()
        .from(volunteerParticipationsTable)
        .where(eq(volunteerParticipationsTable.volunteerId, id))
        .orderBy(desc(volunteerParticipationsTable.participatedAt))
        .limit(MAX_PARTICIPATIONS);

      const items = rows.map(formatParticipation);

      res.setHeader("Cache-Control", "private, no-store");
      return res.json({
        items,
        summary: summarizeParticipation(items),
      });
    } catch (err) {
      req.log.error({ err }, "Failed to list volunteer participations");
      return res
        .status(500)
        .json({ error: "server_error", message: "No se pudo leer el historial" });
    }
  },
);

/** POST /admin/volunteers/:id/participations — registrar una participación. */
router.post(
  "/admin/volunteers/:id/participations",
  ...communityRoles,
  adminActionLimiter,
  async (req, res) => {
    try {
      const volunteerId = parseId(req.params.id);
      if (volunteerId === null) {
        return res.status(400).json({ error: "validation_error", message: "ID inválido." });
      }

      const parsed = validateParticipation({
        activityType: req.body?.activityType,
        title: req.body?.title,
        description: req.body?.description,
        hours: req.body?.hours,
        participatedAt: req.body?.participatedAt,
        campaignId: req.body?.campaignId,
      });
      if (!parsed.ok) {
        return res.status(400).json({ error: "validation_error", message: parsed.message });
      }

      if (!(await volunteerExists(volunteerId))) {
        return res
          .status(404)
          .json({ error: "not_found", message: "Voluntario no encontrado." });
      }

      const actor = req.session?.adminUser ?? null;

      const [row] = await db
        .insert(volunteerParticipationsTable)
        .values({
          volunteerId,
          campaignId: parsed.value.campaignId,
          activityType: parsed.value.activityType,
          title: parsed.value.title,
          description: parsed.value.description,
          hours: parsed.value.hours,
          participatedAt: parsed.value.participatedAt,
          recordedBy: actor?.username ?? null,
        })
        .returning();

      await logAuditAction({
        ...auditContext(req),
        action: AUDIT_ACTIONS.volunteerParticipationRecorded,
        resource: AUDIT_RESOURCES.volunteers,
        resourceId: String(volunteerId),
        details: {
          activityType: row.activityType,
          hours: row.hours === null ? null : Number(row.hours),
          campaignId: row.campaignId,
        },
      });

      return res.status(201).json(formatParticipation(row));
    } catch (err) {
      req.log.error({ err }, "Failed to record volunteer participation");
      return res
        .status(500)
        .json({ error: "server_error", message: "No se pudo registrar la participación" });
    }
  },
);

export default router;

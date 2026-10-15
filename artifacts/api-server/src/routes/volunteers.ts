import { Router, type IRouter } from "express";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { db } from "@workspace/db";
import { volunteersTable, insertVolunteerSchema } from "@workspace/db/schema";
import { and, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { toIsoSafe } from "../lib/date-format";
import { volunteerLimiter, adminActionLimiter } from "../middleware/rate-limit";
import { requireAdmin } from "../middleware/require-admin";
import { requireRole, ROLES } from "../middleware/roles";
import { logAuditAction } from "../middleware/auth-utils";
import { AUDIT_ACTIONS, AUDIT_RESOURCES, auditContext } from "../lib/audit";
import {
  allowedTransitions,
  canTransition,
  normalizeVolunteerEmail,
  requiresDecisionTrace,
  transitionError,
  volunteerStatusLabel,
} from "../lib/volunteer-lifecycle";

// Comunidad: la gestionan administración Y moderadores. Ojo: `requireRole` con
// un único rol dejaría fuera a los administradores (solo el superadmin pasa
// siempre), por eso se listan ambos.
const communityRoles = [requireAdmin, requireRole(ROLES.ADMIN, ROLES.MODERATOR)];

const router: IRouter = Router();

/** Longitud mínima del token público: descarta enlaces truncados sin tocar la DB. */
const MIN_TOKEN_LENGTH = 16;

function formatVolunteer(v: typeof volunteersTable.$inferSelect) {
  return {
    id: v.id,
    name: v.name,
    email: v.email,
    phone: v.phone,
    age: v.age,
    district: v.district,
    availability: v.availability,
    skills: v.skills,
    interests: v.interests,
    motivation: v.motivation,
    priorExperience: v.priorExperience,
    status: v.status,
    statusLabel: volunteerStatusLabel(v.status),
    // Estados a los que se puede pasar. La UI solo ofrece acciones VÁLIDAS: la
    // regla vive en el servidor (única fuente de verdad).
    allowedTransitions: [...allowedTransitions(v.status)],
    adminNotes: v.adminNotes,
    photo: v.photo,
    // Token del enlace de seguimiento: lo necesita el panel para compartirlo con
    // el voluntario. El endpoint de consulta pública NO lo devuelve.
    publicToken: v.publicToken,
    approvedAt: toIsoSafe(v.approvedAt),
    approvedBy: v.approvedBy,
    updatedAt: toIsoSafe(v.updatedAt),
    createdAt: toIsoSafe(v.createdAt),
  };
}

/**
 * DTO PÚBLICO de una postulación de voluntario (V14-02, seguridad).
 *
 * `POST /volunteers` es una ruta PÚBLICA y devolvía `formatVolunteer(...)`, que
 * incluye campos ADMINISTRATIVOS: `adminNotes` (notas internas del equipo) y
 * `approvedBy` (quién la aprobó). El registro no debe revelar nada de eso.
 *
 * Se expone lo mínimo que la persona necesita: su estado y su enlace de seguimiento
 * (su propio token, que la interfaz usa para mostrarle el enlace).
 */
function formatPublicVolunteer(v: typeof volunteersTable.$inferSelect) {
  return {
    id: v.id,
    name: v.name,
    status: v.status,
    statusLabel: volunteerStatusLabel(v.status),
    publicToken: v.publicToken,
    createdAt: toIsoSafe(v.createdAt),
  };
}

// ─── PUBLIC: registro permanente ──────────────────────────────────────────────
router.post("/volunteers", volunteerLimiter, async (req, res) => {
  try {
    const parsed = insertVolunteerSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: "validation_error", message: "Datos de voluntario inválidos" });
    }
    const data = parsed.data;
    const email = normalizeVolunteerEmail(data.email);
    if (!email) {
      return res
        .status(400)
        .json({ error: "validation_error", message: "El correo es obligatorio" });
    }

    // Registro PERMANENTE: un mismo correo no genera fichas duplicadas.
    const [existing] = await db
      .select({ id: volunteersTable.id })
      .from(volunteersTable)
      .where(sql`lower(${volunteersTable.email}) = ${email}`)
      .limit(1);
    if (existing) {
      return res.status(409).json({
        error: "duplicate",
        message:
          "Ya existe una postulación con este correo. Escríbenos si necesitas actualizar tus datos.",
      });
    }

    const [volunteer] = await db
      .insert(volunteersTable)
      .values({
        ...data,
        email: data.email.trim(),
        status: "pending",
        publicToken: randomBytes(24).toString("base64url"),
        updatedAt: new Date(),
      })
      .returning();

    // V14-02: DTO PÚBLICO. Antes se devolvía la ficha administrativa completa, con
    // `adminNotes` y `approvedBy` incluidos, a una ruta pública.
    return res.status(201).json(formatPublicVolunteer(volunteer));
  } catch (err) {
    req.log.error({ err }, "Failed to register volunteer");
    return res
      .status(400)
      .json({ error: "validation_error", message: "Datos de voluntario inválidos" });
  }
});

// ─── PUBLIC: consulta de estado por token (divulgación mínima) ────────────────
router.get("/volunteers/status/:token", volunteerLimiter, async (req, res) => {
  try {
    const token = String(req.params.token ?? "").trim();
    if (token.length < MIN_TOKEN_LENGTH || token.length > 128) {
      return res.status(404).json({ error: "not_found", message: "Enlace no válido." });
    }

    const [row] = await db
      .select({
        status: volunteersTable.status,
        updatedAt: volunteersTable.updatedAt,
      })
      .from(volunteersTable)
      .where(eq(volunteersTable.publicToken, token))
      .limit(1);

    if (!row) {
      return res.status(404).json({ error: "not_found", message: "Enlace no válido." });
    }

    // Sin nombre, correo ni teléfono: el token solo confirma el ESTADO.
    res.setHeader("Cache-Control", "no-store");
    return res.json({
      status: row.status,
      statusLabel: volunteerStatusLabel(row.status),
      updatedAt: toIsoSafe(row.updatedAt),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to read volunteer status");
    return res
      .status(500)
      .json({ error: "server_error", message: "No se pudo consultar el estado" });
  }
});

// ─── ADMIN: listado con filtros ───────────────────────────────────────────────
router.get("/admin/volunteers", ...communityRoles, adminActionLimiter, async (req, res) => {
  try {
    const conditions: SQL[] = [];

    const status = req.query.status;
    if (typeof status === "string" && status && status !== "all") {
      conditions.push(eq(volunteersTable.status, status));
    }

    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    if (search) {
      const pattern = `%${search}%`;
      const clause = or(
        ilike(volunteersTable.name, pattern),
        ilike(volunteersTable.email, pattern),
      );
      if (clause) conditions.push(clause);
    }

    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 200, 1), 500);
    const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);

    const rows = await db
      .select()
      .from(volunteersTable)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(volunteersTable.createdAt))
      .limit(limit)
      .offset(offset);

    res.setHeader("Cache-Control", "private, no-store");
    return res.json(rows.map(formatVolunteer));
  } catch (err) {
    req.log.error({ err }, "Failed to list volunteers");
    return res
      .status(500)
      .json({ error: "server_error", message: "No se pudieron listar las postulaciones" });
  }
});

// ─── ADMIN: ficha completa de una postulación ─────────────────────────────────
router.get("/admin/volunteers/:id", ...communityRoles, adminActionLimiter, async (req, res) => {
  try {
    const id = Number.parseInt(String(req.params.id ?? ""), 10);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: "validation_error", message: "ID inválido." });
    }

    const [row] = await db
      .select()
      .from(volunteersTable)
      .where(eq(volunteersTable.id, id))
      .limit(1);

    if (!row) {
      return res
        .status(404)
        .json({ error: "not_found", message: "Postulación no encontrada." });
    }

    res.setHeader("Cache-Control", "private, no-store");
    return res.json(formatVolunteer(row));
  } catch (err) {
    req.log.error({ err }, "Failed to read volunteer");
    return res
      .status(500)
      .json({ error: "server_error", message: "No se pudo leer la postulación" });
  }
});

// Schema de actualización: estado restringido al flujo y notas opcionales
// (anti mass-assignment).
const updateVolunteerSchema = z.object({
  status: z.enum(["pending", "reviewing", "approved", "contacted", "rejected"]),
  adminNotes: z.string().max(2000).optional(),
});

// ─── ADMIN: cambio de estado TRAZABLE ─────────────────────────────────────────
router.patch("/admin/volunteers/:id", ...communityRoles, adminActionLimiter, async (req, res) => {
  try {
    const id = Number.parseInt(String(req.params.id ?? ""), 10);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: "validation_error", message: "ID inválido." });
    }

    const parsed = updateVolunteerSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "validation_error",
        message: "Datos inválidos",
        details: parsed.error.issues,
      });
    }

    const [existing] = await db
      .select()
      .from(volunteersTable)
      .where(eq(volunteersTable.id, id))
      .limit(1);
    if (!existing) {
      return res
        .status(404)
        .json({ error: "not_found", message: "Postulación no encontrada." });
    }

    const { status, adminNotes } = parsed.data;
    if (!canTransition(existing.status, status)) {
      return res.status(409).json({
        error: "invalid_transition",
        message: transitionError(existing.status, status),
      });
    }

    const actor = req.session?.adminUser ?? null;
    const decided = requiresDecisionTrace(status);

    const [updated] = await db
      .update(volunteersTable)
      .set({
        status,
        ...(adminNotes !== undefined ? { adminNotes } : {}),
        updatedAt: new Date(),
        // Decisión trazable: quién y cuándo. Nunca se decide en silencio.
        ...(decided
          ? { approvedAt: new Date(), approvedBy: actor?.username ?? null }
          : {}),
      })
      .where(eq(volunteersTable.id, id))
      .returning();

    await logAuditAction({
      ...auditContext(req),
      action:
        status === "approved"
          ? AUDIT_ACTIONS.volunteerApproved
          : status === "rejected"
            ? AUDIT_ACTIONS.volunteerRejected
            : AUDIT_ACTIONS.volunteerStatusChanged,
      resource: AUDIT_RESOURCES.volunteers,
      resourceId: String(id),
      details: { from: existing.status, to: status },
    });

    return res.json(formatVolunteer(updated));
  } catch (err) {
    req.log.error({ err }, "Failed to update volunteer");
    return res
      .status(500)
      .json({ error: "server_error", message: "No se pudo actualizar la postulación" });
  }
});

export default router;

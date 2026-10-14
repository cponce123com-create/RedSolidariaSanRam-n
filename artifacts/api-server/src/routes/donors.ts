import { Router, type IRouter } from "express";
import {
  db,
  donorsTable,
  donationsTable,
  insertDonorSchema,
} from "@workspace/db";
import { eq, desc, sql } from "drizzle-orm";
import { requireAdmin } from "../middleware/require-admin";
import { requireRole, ROLES } from "../middleware/roles";
import { adminActionLimiter } from "../middleware/rate-limit";
import { toIsoSafe } from "../lib/date-format";
import { toSafeAmount } from "../lib/amount-format";
import { hasPgErrorCode } from "../lib/pg-errors";
import {
  DONOR_TYPES,
  findDuplicateGroups,
  isDonorType,
  reconcileBlockReason,
} from "../lib/donor-identity";

// Los datos de donantes son PRIVADOS: todo este router exige administrador.
// (El gate global /admin/* ya aplica, pero se repite aquí por defensa en
// profundidad, igual que en leftovers/evidence.)
const adminOnly = [requireAdmin, requireRole(ROLES.ADMIN)];

const router: IRouter = Router();

function parseId(raw: unknown): number | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function currentUsername(
  req: { session?: { adminUser?: { username?: string | null } | null } | null },
): string | null {
  return req.session?.adminUser?.username ?? null;
}

function formatDonor(d: typeof donorsTable.$inferSelect) {
  return {
    id: d.id,
    type: d.type,
    name: d.name,
    email: d.email,
    phone: d.phone,
    isRecurring: d.isRecurring,
    notes: d.notes,
    createdAt: toIsoSafe(d.createdAt),
    updatedAt: toIsoSafe(d.updatedAt),
  };
}

function formatDonationSummary(d: typeof donationsTable.$inferSelect) {
  return {
    id: d.id,
    campaignId: d.campaignId,
    donorId: d.donorId,
    firstName: d.firstName,
    lastName: d.lastName,
    amount: toSafeAmount(d.amount),
    paymentMethod: d.paymentMethod,
    status: d.status,
    anonymous: d.anonymous,
    createdAt: toIsoSafe(d.createdAt),
    reconciledAt: d.reconciledAt ? toIsoSafe(d.reconciledAt) : null,
    reconciledBy: d.reconciledBy ?? null,
  };
}

/**
 * GET /admin/donors — perfiles de donante con totales agregados (privado).
 * Los totales suman donaciones aprobadas y conciliadas (dinero confirmado).
 */
router.get("/admin/donors", ...adminOnly, adminActionLimiter, async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 50, 1), 200);
    const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);

    const rows = await db
      .select({
        donor: donorsTable,
        donationCount: sql<number>`count(${donationsTable.id})::int`,
        confirmedTotal: sql<number>`coalesce(sum(${donationsTable.amount}) filter (where ${donationsTable.status} in ('approved','reconciled')), 0)::float8`,
      })
      .from(donorsTable)
      .leftJoin(donationsTable, eq(donationsTable.donorId, donorsTable.id))
      .groupBy(donorsTable.id)
      .orderBy(desc(donorsTable.createdAt))
      .limit(limit)
      .offset(offset);

    res.setHeader("Cache-Control", "private, no-store");
    res.json(
      rows.map(({ donor, donationCount, confirmedTotal }) => ({
        ...formatDonor(donor),
        donationCount,
        confirmedTotal,
      })),
    );
  } catch (err) {
    req.log.error({ err }, "Failed to list donors");
    res.status(500).json({ error: "server_error", message: "No se pudieron listar los donantes" });
  }
});

/** GET /admin/donors/:id — ficha del donante con su historial (privado). */
router.get("/admin/donors/:id", ...adminOnly, adminActionLimiter, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (id === null) {
      return res.status(400).json({ error: "validation_error", message: "Identificador inválido" });
    }
    const [donor] = await db.select().from(donorsTable).where(eq(donorsTable.id, id));
    if (!donor) {
      return res.status(404).json({ error: "not_found", message: "Donante no encontrado" });
    }
    const history = await db
      .select()
      .from(donationsTable)
      .where(eq(donationsTable.donorId, id))
      .orderBy(desc(donationsTable.createdAt));

    res.setHeader("Cache-Control", "private, no-store");
    return res.json({
      ...formatDonor(donor),
      donations: history.map(formatDonationSummary),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get donor");
    return res.status(500).json({ error: "server_error", message: "No se pudo obtener el donante" });
  }
});

/** POST /admin/donors — crea un perfil de donante. */
router.post("/admin/donors", ...adminOnly, adminActionLimiter, async (req, res) => {
  let data: ReturnType<typeof insertDonorSchema.parse>;
  try {
    data = insertDonorSchema.parse(req.body);
  } catch {
    return res.status(400).json({ error: "validation_error", message: "Datos de donante inválidos" });
  }
  if (data.type !== undefined && !isDonorType(data.type)) {
    return res.status(400).json({
      error: "validation_error",
      message: `Tipo inválido. Permitidos: ${DONOR_TYPES.join(", ")}`,
    });
  }
  try {
    const [donor] = await db.insert(donorsTable).values(data).returning();
    return res.status(201).json(formatDonor(donor));
  } catch (err) {
    if (hasPgErrorCode(err, "23505")) {
      return res.status(409).json({
        error: "conflict",
        message: "Ya existe un donante con ese correo.",
      });
    }
    req.log.error({ err }, "Failed to create donor");
    return res.status(500).json({ error: "server_error", message: "No se pudo crear el donante" });
  }
});

/** PUT /admin/donors/:id — actualiza un perfil de donante. */
router.put("/admin/donors/:id", ...adminOnly, adminActionLimiter, async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    return res.status(400).json({ error: "validation_error", message: "Identificador inválido" });
  }
  let data: ReturnType<typeof insertDonorSchema.parse>;
  try {
    data = insertDonorSchema.parse(req.body);
  } catch {
    return res.status(400).json({ error: "validation_error", message: "Datos de donante inválidos" });
  }
  if (data.type !== undefined && !isDonorType(data.type)) {
    return res.status(400).json({
      error: "validation_error",
      message: `Tipo inválido. Permitidos: ${DONOR_TYPES.join(", ")}`,
    });
  }
  try {
    const [donor] = await db
      .update(donorsTable)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(donorsTable.id, id))
      .returning();
    if (!donor) {
      return res.status(404).json({ error: "not_found", message: "Donante no encontrado" });
    }
    return res.json(formatDonor(donor));
  } catch (err) {
    if (hasPgErrorCode(err, "23505")) {
      return res.status(409).json({
        error: "conflict",
        message: "Ya existe otro donante con ese correo.",
      });
    }
    req.log.error({ err }, "Failed to update donor");
    return res.status(500).json({ error: "server_error", message: "No se pudo actualizar el donante" });
  }
});

/**
 * GET /admin/donations/duplicates — posibles duplicados (privado).
 * Compara correo + monto + día: un doble envío del formulario cae el mismo día
 * con segundos distintos, por eso no se usa la marca de tiempo completa.
 */
router.get("/admin/donations/duplicates", ...adminOnly, adminActionLimiter, async (req, res) => {
  try {
    const rows = await db
      .select({
        id: donationsTable.id,
        campaignId: donationsTable.campaignId,
        donorId: donationsTable.donorId,
        firstName: donationsTable.firstName,
        lastName: donationsTable.lastName,
        email: donationsTable.email,
        amount: donationsTable.amount,
        paymentMethod: donationsTable.paymentMethod,
        status: donationsTable.status,
        createdAt: donationsTable.createdAt,
      })
      .from(donationsTable)
      .orderBy(desc(donationsTable.createdAt))
      .limit(1000);

    const groups = findDuplicateGroups(
      rows.map((r) => ({ ...r, amount: toSafeAmount(r.amount) })),
    );

    res.setHeader("Cache-Control", "private, no-store");
    res.json(
      groups.map((group) => ({
        key: `${group[0]?.email ?? ""}|${group.length}`,
        count: group.length,
        donations: group.map((d) => ({
          id: d.id,
          campaignId: d.campaignId,
          donorId: d.donorId,
          name: `${d.firstName} ${d.lastName}`.trim(),
          amount: toSafeAmount(d.amount),
          paymentMethod: d.paymentMethod,
          status: d.status,
          createdAt: toIsoSafe(d.createdAt),
        })),
      })),
    );
  } catch (err) {
    req.log.error({ err }, "Failed to detect duplicate donations");
    res.status(500).json({ error: "server_error", message: "No se pudieron detectar duplicados" });
  }
});

/**
 * PATCH /admin/donations/:id/reconcile — conciliación bancaria TRAZABLE.
 * Solo sobre donaciones aprobadas; registra quién y cuándo concilió.
 */
router.patch("/admin/donations/:id/reconcile", ...adminOnly, adminActionLimiter, async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    return res.status(400).json({ error: "validation_error", message: "Identificador inválido" });
  }
  try {
    const [donation] = await db
      .select()
      .from(donationsTable)
      .where(eq(donationsTable.id, id));
    if (!donation) {
      return res.status(404).json({ error: "not_found", message: "Donación no encontrada" });
    }
    const blocked = reconcileBlockReason(donation.status);
    if (blocked) {
      return res.status(409).json({ error: "conflict", message: blocked });
    }
    const [updated] = await db
      .update(donationsTable)
      .set({
        status: "reconciled",
        reconciledAt: new Date(),
        reconciledBy: currentUsername(req),
      })
      .where(eq(donationsTable.id, id))
      .returning();
    return res.json(formatDonationSummary(updated));
  } catch (err) {
    req.log.error({ err }, "Failed to reconcile donation");
    return res.status(500).json({ error: "server_error", message: "No se pudo conciliar la donación" });
  }
});

export default router;

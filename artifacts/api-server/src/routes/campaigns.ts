import { Router, type IRouter } from "express";
import {
  db,
  campaignsTable,
  donationsTable,
  campaignMovementsTable,
  campaignExpensesTable,
  campaignEvidenceTable,
  campaignLeftoversTable,
  campaignImagesTable,
  campaignUpdatesTable,
  communityReportsTable,
  settings,
  insertCampaignSchema,
} from "@workspace/db";
import { eq, and, sql, desc, inArray, notInArray, type SQL } from "drizzle-orm";
import { requireAdmin } from "../middleware/require-admin";
import { adminActionLimiter } from "../middleware/rate-limit";
import { logAuditAction } from "../middleware/auth-utils";
import { AUDIT_ACTIONS, AUDIT_RESOURCES, auditContext } from "../lib/audit";
import { toIsoSafe } from "../lib/date-format";
import { toSafeAmount } from "../lib/amount-format";
import { campaignFunding } from "../lib/funding";
import { isForeignKeyViolation } from "../lib/pg-errors";
import {
  CAMPAIGN_STATUSES,
  HIDDEN_STATUSES,
  PROTAGONIST_SETTING_KEY,
  canTransition,
  deleteBlockReason,
  isCampaignStatus,
  isHiddenStatus,
  transitionError,
  type CampaignDependencies,
} from "../lib/campaign-lifecycle";
import { CONFIRMED_DONATION_STATUSES } from "../lib/donor-identity";

const router: IRouter = Router();

// Una campaña se considera "en borrador" (no publicada) cuando su estado es
// `draft`. Solo el administrador autenticado puede verlas y gestionarlas.
function isAdminRequest(req: { session?: { adminUser?: unknown } }): boolean {
  return Boolean(req.session?.adminUser);
}

// `req.params.id` puede venir tipado como `string` o `string[]` según la
// versión de los tipos de Express; se normaliza de forma segura a un entero.
function parseId(raw: unknown): number | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * Cuenta las filas dependientes de una campaña (para el borrado seguro).
 *
 * Incluye los REPORTES CIUDADANOS: `community_reports.campaign_id` no tiene FK
 * (a diferencia del libro contable), así que sin contarlos el borrado los
 * dejaría huérfanos apuntando a una campaña inexistente.
 */
async function countCampaignDependencies(
  campaignId: number,
): Promise<CampaignDependencies> {
  const [
    donations,
    movements,
    expenses,
    evidence,
    leftovers,
    images,
    updates,
    communityReports,
  ] = await Promise.all([
      db.select({ n: sql<number>`count(*)::int` }).from(donationsTable).where(eq(donationsTable.campaignId, campaignId)),
      db.select({ n: sql<number>`count(*)::int` }).from(campaignMovementsTable).where(eq(campaignMovementsTable.campaignId, campaignId)),
      db.select({ n: sql<number>`count(*)::int` }).from(campaignExpensesTable).where(eq(campaignExpensesTable.campaignId, campaignId)),
      db.select({ n: sql<number>`count(*)::int` }).from(campaignEvidenceTable).where(eq(campaignEvidenceTable.campaignId, campaignId)),
      db.select({ n: sql<number>`count(*)::int` }).from(campaignLeftoversTable).where(eq(campaignLeftoversTable.campaignId, campaignId)),
      db.select({ n: sql<number>`count(*)::int` }).from(campaignImagesTable).where(eq(campaignImagesTable.campaignId, campaignId)),
      db.select({ n: sql<number>`count(*)::int` }).from(campaignUpdatesTable).where(eq(campaignUpdatesTable.campaignId, campaignId)),
      db.select({ n: sql<number>`count(*)::int` }).from(communityReportsTable).where(eq(communityReportsTable.campaignId, campaignId)),
    ]);

  return {
    donations: donations[0]?.n ?? 0,
    movements: movements[0]?.n ?? 0,
    expenses: expenses[0]?.n ?? 0,
    evidence: evidence[0]?.n ?? 0,
    leftovers: leftovers[0]?.n ?? 0,
    images: images[0]?.n ?? 0,
    updates: updates[0]?.n ?? 0,
    communityReports: communityReports[0]?.n ?? 0,
  };
}

/**
 * Limpia la campaña protagonista de la portada si coincide con `campaignId`.
 * Se invoca al despublicar, archivar o eliminar: evita un protagonista colgado
 * apuntando a una campaña que ya no se muestra.
 */
async function clearProtagonistIfMatches(campaignId: number): Promise<void> {
  await db
    .update(settings)
    .set({ value: "", updatedAt: new Date() })
    .where(
      and(
        eq(settings.key, PROTAGONIST_SETTING_KEY),
        eq(settings.value, String(campaignId)),
      ),
    );
}

// GET /campaigns — público, con filtros, paginación y agregación en una sola query.
// Los estados `draft` y `archived` quedan OCULTOS al público; el administrador
// autenticado (sesión) los ve todos. Como la respuesta depende de la sesión,
// nunca se cachea en proxies compartidos cuando la sirve un admin.
router.get("/campaigns", async (req, res) => {
  try {
    const { status, featured, limit: rawLimit, offset: rawOffset } = req.query;
    const limit = Math.min(Math.max(parseInt(rawLimit as string) || 50, 1), 100);
    const offset = Math.max(parseInt(rawOffset as string) || 0, 0);
    const isAdmin = isAdminRequest(req);
    const statusFilter = typeof status === "string" ? status : undefined;

    const conditions: SQL[] = [];
    if (statusFilter && statusFilter !== "all") {
      // Borradores/archivadas solo para administradores: al público no se le
      // filtra por ellos (lista vacía en vez de revelar su existencia).
      if (isHiddenStatus(statusFilter) && !isAdmin) {
        res.json([]);
        return;
      }
      conditions.push(eq(campaignsTable.status, statusFilter));
    } else if (!isAdmin) {
      conditions.push(notInArray(campaignsTable.status, [...HIDDEN_STATUSES]));
    }
    if (featured !== undefined && featured !== "all") {
      conditions.push(eq(campaignsTable.featured, featured === "true"));
    }

    const rows = await db
      .select({
        campaign: campaignsTable,
        // Una donación en especie (valor estimado 0) no es un aporte de dinero:
        // no cuenta como donante en las cifras de recaudación.
        donorCount: sql<number>`count(${donationsTable.id}) filter (where ${donationsTable.status} in ('approved','reconciled') and ${donationsTable.amount} > 0)::int`,
        raisedFromDonations: sql<number>`coalesce(sum(${donationsTable.amount}) filter (where ${donationsTable.status} in ('approved','reconciled')), 0)::float8`,
      })
      .from(campaignsTable)
      .leftJoin(donationsTable, eq(donationsTable.campaignId, campaignsTable.id))
      .where(conditions.length ? and(...conditions) : undefined)
      .groupBy(campaignsTable.id)
      .orderBy(desc(campaignsTable.createdAt))
      .limit(limit)
      .offset(offset);

    if (isAdmin) res.setHeader("Cache-Control", "private, no-store");

    res.json(
      rows.map(({ campaign, donorCount, raisedFromDonations }) =>
        formatCampaign(campaign, donorCount, raisedFromDonations),
      ),
    );
  } catch (err) {
    req.log.error({ err }, "Failed to get campaigns");
    res.status(500).json({ error: "server_error", message: "Failed to get campaigns" });
  }
});

router.get("/campaigns/:id", async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (id === null) {
      return res.status(400).json({ error: "validation_error", message: "Identificador inválido" });
    }
    const [row] = await db
      .select({
        campaign: campaignsTable,
        // Una donación en especie (valor estimado 0) no es un aporte de dinero:
        // no cuenta como donante en las cifras de recaudación.
        donorCount: sql<number>`count(${donationsTable.id}) filter (where ${donationsTable.status} in ('approved','reconciled') and ${donationsTable.amount} > 0)::int`,
        raisedFromDonations: sql<number>`coalesce(sum(${donationsTable.amount}) filter (where ${donationsTable.status} in ('approved','reconciled')), 0)::float8`,
      })
      .from(campaignsTable)
      .leftJoin(donationsTable, eq(donationsTable.campaignId, campaignsTable.id))
      .where(eq(campaignsTable.id, id))
      .groupBy(campaignsTable.id)
      .limit(1);

    if (!row) {
      return res.status(404).json({ error: "not_found", message: "Campaign not found" });
    }
    // Un borrador no publicado no se expone al público (404 como si no existiera).
    if (!isAdminRequest(req) && row.campaign.status === "draft") {
      return res.status(404).json({ error: "not_found", message: "Campaign not found" });
    }
    if (isAdminRequest(req)) res.setHeader("Cache-Control", "private, no-store");
    return res.json(
      formatCampaign(row.campaign, row.donorCount, row.raisedFromDonations),
    );
  } catch (err) {
    req.log.error({ err }, "Failed to get campaign");
    return res.status(500).json({ error: "server_error", message: "Failed to get campaign" });
  }
});

// GET /campaigns/:id/donors — público: donantes aprobados de la campaña.
// Nunca expone email/phone; el nombre se omite si la donación es anónima y
// el comprobante solo se muestra si el donante autorizó (publicProof).
// Paginado: ?limit= (default 50, máx 200) & ?offset= ; el total va en X-Total-Count.
router.get("/campaigns/:id/donors", async (req, res) => {
  try {
    const campaignId = Number(req.params.id);
    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 50, 1), 200);
    const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);

    const approved = and(
      eq(donationsTable.campaignId, campaignId),
      // Un dinero conciliado sigue siendo dinero confirmado: la lista pública
      // de donantes debe incluir AMBOS estados.
      inArray(donationsTable.status, [...CONFIRMED_DONATION_STATUSES]),
      // Es la lista de aportes de DINERO: una donación en especie (valor 0) no
      // aparece como "S/ 0" ni se cuenta en el total de donantes.
      sql`${donationsTable.amount} > 0`,
    );

    // count(*)::int → pg devuelve int4 como number (count nativo viene como string)
    const [countRow] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(donationsTable)
      .where(approved);
    res.setHeader("X-Total-Count", String(countRow?.total ?? 0));

    const donors = await db
      .select({
        id: donationsTable.id,
        firstName: donationsTable.firstName,
        lastName: donationsTable.lastName,
        amount: donationsTable.amount,
        message: donationsTable.message,
        anonymous: donationsTable.anonymous,
        publicProof: donationsTable.publicProof,
        receiptUrl: donationsTable.receiptUrl,
        createdAt: donationsTable.createdAt,
      })
      .from(donationsTable)
      .where(approved)
      .orderBy(desc(donationsTable.createdAt))
      .limit(limit)
      .offset(offset);

    res.json(
      donors.map((d) => ({
        id: d.id,
        name: d.anonymous ? null : `${d.firstName} ${d.lastName}`.trim(),
        amount: toSafeAmount(d.amount),
        message: d.message,
        date: d.createdAt.toISOString(),
        publicProof: d.publicProof,
        proofUrl: d.publicProof ? d.receiptUrl : null,
      })),
    );
  } catch (err) {
    req.log.error({ err }, "Failed to get campaign donors");
    res.status(500).json({ error: "server_error", message: "Failed to get campaign donors" });
  }
});

router.post("/campaigns", requireAdmin, adminActionLimiter, async (req, res) => {
  let data: ReturnType<typeof insertCampaignSchema.parse>;
  try {
    data = insertCampaignSchema.parse(req.body);
  } catch {
    return res.status(400).json({ error: "validation_error", message: "Datos de campaña inválidos" });
  }
  if (data.status !== undefined && !isCampaignStatus(data.status)) {
    return res.status(400).json({
      error: "validation_error",
      message: `Estado inválido. Permitidos: ${CAMPAIGN_STATUSES.join(", ")}`,
    });
  }
  try {
    const [campaign] = await db.insert(campaignsTable).values(data).returning();
    return res.status(201).json(formatCampaign(campaign, 0, 0));
  } catch (err) {
    req.log.error({ err }, "Failed to create campaign");
    return res.status(500).json({ error: "server_error", message: "No se pudo crear la campaña" });
  }
});

router.put("/campaigns/:id", requireAdmin, adminActionLimiter, async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    return res.status(400).json({ error: "validation_error", message: "Identificador inválido" });
  }
  let data: ReturnType<typeof insertCampaignSchema.parse>;
  try {
    data = insertCampaignSchema.parse(req.body);
  } catch {
    return res.status(400).json({ error: "validation_error", message: "Datos de campaña inválidos" });
  }
  if (data.status !== undefined && !isCampaignStatus(data.status)) {
    return res.status(400).json({
      error: "validation_error",
      message: `Estado inválido. Permitidos: ${CAMPAIGN_STATUSES.join(", ")}`,
    });
  }
  try {
    const [existing] = await db
      .select()
      .from(campaignsTable)
      .where(eq(campaignsTable.id, id));
    if (!existing) {
      return res.status(404).json({ error: "not_found", message: "Campaña no encontrada" });
    }
    const changesStatus = data.status !== undefined && data.status !== existing.status;
    if (changesStatus && !canTransition(existing.status, data.status as string)) {
      return res.status(409).json({
        error: "invalid_transition",
        message: transitionError(existing.status, data.status as string),
      });
    }
    const [campaign] = await db
      .update(campaignsTable)
      .set(data)
      .where(eq(campaignsTable.id, id))
      .returning();
    if (!campaign) {
      return res.status(404).json({ error: "not_found", message: "Campaña no encontrada" });
    }
    if (changesStatus && isHiddenStatus(campaign.status)) {
      await clearProtagonistIfMatches(id);
    }
    return res.json(formatCampaign(campaign, 0, 0));
  } catch (err) {
    req.log.error({ err }, "Failed to update campaign");
    return res.status(500).json({ error: "server_error", message: "No se pudo actualizar la campaña" });
  }
});

/**
 * PATCH /campaigns/:id/status — ciclo de vida de la campaña.
 * Body: { status: "draft" | "active" | "paused" | "completed" | "archived" }.
 * Valida la transición desde el estado actual (409 si no está permitida) y
 * limpia la campaña protagonista si el nuevo estado la oculta.
 */
router.patch("/campaigns/:id/status", requireAdmin, adminActionLimiter, async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    return res.status(400).json({ error: "validation_error", message: "Identificador inválido" });
  }
  const target = (req.body ?? {}).status;
  if (!isCampaignStatus(target)) {
    return res.status(400).json({
      error: "validation_error",
      message: `Estado inválido. Permitidos: ${CAMPAIGN_STATUSES.join(", ")}`,
    });
  }
  try {
    const [existing] = await db
      .select()
      .from(campaignsTable)
      .where(eq(campaignsTable.id, id));
    if (!existing) {
      return res.status(404).json({ error: "not_found", message: "Campaña no encontrada" });
    }
    if (existing.status === target) {
      return res.json(formatCampaign(existing, 0, 0)); // idempotente
    }
    if (!canTransition(existing.status, target)) {
      return res.status(409).json({
        error: "invalid_transition",
        message: transitionError(existing.status, target),
      });
    }
    const [updated] = await db
      .update(campaignsTable)
      .set({ status: target })
      .where(eq(campaignsTable.id, id))
      .returning();
    if (isHiddenStatus(target)) {
      await clearProtagonistIfMatches(id);
    }
    // Auditoría (Fase 4): el ciclo de vida de una campaña queda trazado.
    await logAuditAction({
      ...auditContext(req),
      action: AUDIT_ACTIONS.campaignStatusChanged,
      resource: AUDIT_RESOURCES.campaigns,
      resourceId: String(id),
      details: { from: existing.status, to: target },
    });
    return res.json(formatCampaign(updated, 0, 0));
  } catch (err) {
    req.log.error({ err }, "Failed to change campaign status");
    return res.status(500).json({ error: "server_error", message: "No se pudo cambiar el estado de la campaña" });
  }
});

/**
 * DELETE /campaigns/:id — eliminación permanente, RESTRINGIDA a borradores sin
 * dependencias. Nunca borra en cascada historial contable: una campaña con
 * historial se archiva (PATCH .../status → archived). La FK RESTRICT del libro
 * contable (migración 010) actúa como segunda barrera.
 */
router.delete("/campaigns/:id", requireAdmin, adminActionLimiter, async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    return res.status(400).json({ error: "validation_error", message: "Identificador inválido" });
  }
  try {
    const [existing] = await db
      .select()
      .from(campaignsTable)
      .where(eq(campaignsTable.id, id));
    if (!existing) {
      return res.status(404).json({ error: "not_found", message: "Campaña no encontrada" });
    }

    const deps = await countCampaignDependencies(id);
    const blocked = deleteBlockReason(existing.status, deps);
    if (blocked) {
      req.log.warn({ id, status: existing.status, deps }, "Campaign delete blocked");
      return res.status(409).json({ error: "conflict", message: blocked, dependencies: deps });
    }

    await db.delete(campaignsTable).where(eq(campaignsTable.id, id));
    await clearProtagonistIfMatches(id);
    // Auditoría (Fase 4): el borrado permanente queda trazado (título y estado
    // originales, para que el registro siga siendo útil tras el borrado).
    await logAuditAction({
      ...auditContext(req),
      action: AUDIT_ACTIONS.campaignDeleted,
      resource: AUDIT_RESOURCES.campaigns,
      resourceId: String(id),
      details: { title: existing.title, status: existing.status },
    });
    return res.status(204).send();
  } catch (err) {
    // Segunda barrera: si algo escapó a la comprobación anterior, la FK RESTRICT
    // del libro contable lo detiene. Se responde 409 con un mensaje accionable.
    if (isForeignKeyViolation(err)) {
      req.log.warn({ err }, "Campaign delete blocked by ledger FK");
      return res.status(409).json({
        error: "conflict",
        message: "La campaña tiene movimientos registrados en el libro contable y no puede eliminarse. Archívala para conservar el historial.",
      });
    }
    req.log.error({ err }, "Failed to delete campaign");
    return res.status(500).json({ error: "server_error", message: "No se pudo eliminar la campaña" });
  }
});

function formatCampaign(
  c: typeof campaignsTable.$inferSelect,
  donorCount: number,
  raisedFromDonations: number,
) {
  // Recaudación conciliada (Prompt Maestro V7, Fase 3.1): la cifra publicada se
  // deriva de fuentes que NO se solapan, nunca del máximo de dos cantidades.
  // `raised` se conserva por compatibilidad con el contrato público y equivale
  // al total conciliado; el desglose viaja en los campos nuevos para que la
  // interfaz pueda explicar de dónde sale cada sol.
  const funding = campaignFunding(c.raised, raisedFromDonations);

  return {
    id: c.id,
    title: c.title,
    description: c.description,
    imageUrl: c.imageUrl,
    goal: c.goal,
    raised: funding.reconciledRaised,
    verifiedRaised: funding.verifiedRaised,
    historicalRaised: funding.historicalRaised,
    historicalCounted: funding.historicalCounted,
    donorCount,
    status: c.status,
    featured: c.featured,
    category: c.category,
    startDate: c.startDate,
    endDate: c.endDate,
    latitude: c.latitude,
    longitude: c.longitude,
    createdAt: toIsoSafe(c.createdAt),
  };
}

export default router;

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
  campaignBudgetsTable,
  communityReportsTable,
  settings,
  insertCampaignSchema,
} from "@workspace/db";
import { eq, and, sql, desc, inArray, notInArray, type SQL } from "drizzle-orm";
import { requireAdmin } from "../middleware/require-admin";
import { requireRole, ROLES } from "../middleware/roles";
import { adminActionLimiter } from "../middleware/rate-limit";
import { logAuditAction } from "../middleware/auth-utils";
import { AUDIT_ACTIONS, AUDIT_RESOURCES, auditContext } from "../lib/audit";
import { toIsoSafe } from "../lib/date-format";
import { toSafeAmount } from "../lib/amount-format";
import { campaignFunding } from "../lib/funding";
import { isForeignKeyViolation } from "../lib/pg-errors";
import { cleanupCloudinaryAssets } from "../lib/asset-cleanup";
import {
  CAMPAIGN_STATUSES,
  HIDDEN_STATUSES,
  PROTAGONIST_SETTING_KEY,
  canTransition,
  deleteBlockReason,
  deleteDiagnostic,
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
 * Ejecutor de consultas: la conexión global o la transacción en curso. Permite
 * reutilizar el conteo de dependencias dentro de una transacción sin duplicar
 * la lógica ni relajar el tipado.
 */
type DbExecutor = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Un BIEN (`campaign_leftovers`) es PROTEGIDO cuando registra un movimiento real
 * (recibido/usado) o está ligado a un donante/evidencia. Un bien de referencia
 * sin flujo ni vínculo (p. ej. una meta de producto) es auxiliar y eliminable.
 */
function protectedLeftoverCondition(): SQL {
  return sql`(coalesce(${campaignLeftoversTable.receivedQty}, 0) <> 0
    or coalesce(${campaignLeftoversTable.usedQty}, 0) <> 0
    or ${campaignLeftoversTable.donorId} is not null
    or ${campaignLeftoversTable.evidenceId} is not null)`;
}

/**
 * Una EVIDENCIA es PROTEGIDA cuando sirve de prueba de un bien registrado
 * (alguien la referencia). Una evidencia de actividad sin vínculo financiero es
 * auxiliar (Fase 1.1, «evidencias asociadas a transacciones»).
 */
function protectedEvidenceCondition(): SQL {
  return sql`exists (select 1 from campaign_leftovers cl where cl.evidence_id = ${campaignEvidenceTable.id})`;
}

/**
 * Cuenta las filas dependientes de una campaña y las CLASIFICA (Fase 1.1):
 * protegidas (bloquean el borrado), auxiliares (se limpian) y desvinculables
 * (se conservan soltándolas de la campaña). Incluye los REPORTES CIUDADANOS:
 * `community_reports.campaign_id` no tiene FK, así que sin contarlos el borrado
 * los dejaría huérfanos apuntando a una campaña inexistente.
 */
async function countCampaignDependencies(
  exec: DbExecutor,
  campaignId: number,
): Promise<CampaignDependencies> {
  const [
    donations,
    movements,
    expenses,
    evidenceTotal,
    evidenceProtected,
    leftoversTotal,
    leftoversProtected,
    images,
    updates,
    budgets,
    communityReports,
  ] = await Promise.all([
    exec.select({ n: sql<number>`count(*)::int` }).from(donationsTable).where(eq(donationsTable.campaignId, campaignId)),
    exec.select({ n: sql<number>`count(*)::int` }).from(campaignMovementsTable).where(eq(campaignMovementsTable.campaignId, campaignId)),
    exec.select({ n: sql<number>`count(*)::int` }).from(campaignExpensesTable).where(eq(campaignExpensesTable.campaignId, campaignId)),
    exec.select({ n: sql<number>`count(*)::int` }).from(campaignEvidenceTable).where(eq(campaignEvidenceTable.campaignId, campaignId)),
    exec.select({ n: sql<number>`count(*)::int` }).from(campaignEvidenceTable).where(and(eq(campaignEvidenceTable.campaignId, campaignId), protectedEvidenceCondition())),
    exec.select({ n: sql<number>`count(*)::int` }).from(campaignLeftoversTable).where(eq(campaignLeftoversTable.campaignId, campaignId)),
    exec.select({ n: sql<number>`count(*)::int` }).from(campaignLeftoversTable).where(and(eq(campaignLeftoversTable.campaignId, campaignId), protectedLeftoverCondition())),
    exec.select({ n: sql<number>`count(*)::int` }).from(campaignImagesTable).where(eq(campaignImagesTable.campaignId, campaignId)),
    exec.select({ n: sql<number>`count(*)::int` }).from(campaignUpdatesTable).where(eq(campaignUpdatesTable.campaignId, campaignId)),
    exec.select({ n: sql<number>`count(*)::int` }).from(campaignBudgetsTable).where(eq(campaignBudgetsTable.campaignId, campaignId)),
    exec.select({ n: sql<number>`count(*)::int` }).from(communityReportsTable).where(eq(communityReportsTable.campaignId, campaignId)),
  ]);

  const evidenceTotalCount = evidenceTotal[0]?.n ?? 0;
  const evidenceProtectedCount = evidenceProtected[0]?.n ?? 0;
  const leftoversTotalCount = leftoversTotal[0]?.n ?? 0;
  const leftoversProtectedCount = leftoversProtected[0]?.n ?? 0;

  return {
    donations: donations[0]?.n ?? 0,
    movements: movements[0]?.n ?? 0,
    expenses: expenses[0]?.n ?? 0,
    protectedEvidence: evidenceProtectedCount,
    protectedLeftovers: leftoversProtectedCount,
    images: images[0]?.n ?? 0,
    updates: updates[0]?.n ?? 0,
    budgets: budgets[0]?.n ?? 0,
    auxiliaryEvidence: Math.max(0, evidenceTotalCount - evidenceProtectedCount),
    auxiliaryLeftovers: Math.max(0, leftoversTotalCount - leftoversProtectedCount),
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
 * Recopila las URLs de los activos externos (imagen principal, galería y
 * evidencias) para limpiarlas DESPUÉS de confirmar el borrado en la base.
 */
async function collectAssetUrls(
  exec: DbExecutor,
  campaignId: number,
  campaignImageUrl: string | null,
): Promise<string[]> {
  const [images, evidence] = await Promise.all([
    exec
      .select({ url: campaignImagesTable.imageUrl })
      .from(campaignImagesTable)
      .where(eq(campaignImagesTable.campaignId, campaignId)),
    exec
      .select({ url: campaignEvidenceTable.mediaUrl })
      .from(campaignEvidenceTable)
      .where(eq(campaignEvidenceTable.campaignId, campaignId)),
  ]);
  const urls = [campaignImageUrl, ...images.map((r) => r.url), ...evidence.map((r) => r.url)].filter(
    (url): url is string => typeof url === "string" && url.length > 0,
  );
  return [...new Set(urls)];
}

/**
 * GET /campaigns/:id/deletion-diagnostic — diagnóstico previo (Fase 1.2).
 * Devuelve, sin borrar nada, el desglose de dependencias clasificadas, el motivo
 * concreto del bloqueo (si lo hay) y las operaciones permitidas. La interfaz lo
 * muestra ANTES de confirmar cualquier eliminación.
 */
router.get("/campaigns/:id/deletion-diagnostic", requireAdmin, adminActionLimiter, async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    return res.status(400).json({ error: "validation_error", message: "Identificador inválido" });
  }
  try {
    const result = await db.transaction(async (tx) => {
      const [existing] = await tx.select().from(campaignsTable).where(eq(campaignsTable.id, id));
      if (!existing) return null;
      const deps = await countCampaignDependencies(tx, id);
      return {
        id,
        title: existing.title,
        status: existing.status,
        dependencies: deps,
        diagnostic: deleteDiagnostic(existing.status, deps),
      };
    });
    if (!result) {
      return res.status(404).json({ error: "not_found", message: "Campaña no encontrada" });
    }
    res.setHeader("Cache-Control", "private, no-store");
    return res.json(result);
  } catch (err) {
    req.log.error({ err }, "Failed to build campaign deletion diagnostic");
    return res.status(500).json({ error: "server_error", message: "No se pudo analizar la campaña" });
  }
});

/**
 * DELETE /campaigns/:id — eliminación permanente (Fase 1.3, Modalidad A).
 *
 * Solo procede con BORRADORES cuyas únicas dependencias sean auxiliares o
 * desvinculables. Las dependencias PROTEGIDAS (donaciones, movimientos del
 * libro, gastos, evidencias/bienes con obligación de conservación) bloquean el
 * borrado con un 409 que explica exactamente qué lo impide y ofrece archivar.
 *
 * Todo ocurre dentro de una transacción con bloqueo de fila (`for update`): dos
 * borrados concurrentes no pueden perder ni duplicar información. La limpieza
 * del CDN se programa DESPUÉS de confirmar la transacción (best-effort, con
 * reintentos): un fallo externo no corrompe la base.
 */
router.delete("/campaigns/:id", requireAdmin, adminActionLimiter, async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    return res.status(400).json({ error: "validation_error", message: "Identificador inválido" });
  }
  try {
    const outcome = await db.transaction(async (tx) => {
      // Bloqueo de la fila: serializa borrados concurrentes de la misma campaña.
      const [existing] = await tx
        .select()
        .from(campaignsTable)
        .where(eq(campaignsTable.id, id))
        .for("update");
      if (!existing) return { kind: "not_found" as const };

      const deps = await countCampaignDependencies(tx, id);
      const blocked = deleteBlockReason(existing.status, deps);
      if (blocked) {
        return { kind: "blocked" as const, status: existing.status, deps, blocked };
      }

      const assets = await collectAssetUrls(tx, id, existing.imageUrl);

      // C. Reportes ciudadanos: se DESVINCULAN (campaign_id = NULL). No se borran.
      const unlinked = await tx
        .update(communityReportsTable)
        .set({ campaignId: null, updatedAt: new Date() })
        .where(eq(communityReportsTable.campaignId, id))
        .returning({ id: communityReportsTable.id });

      // B. Contenido auxiliar: se elimina dentro de la misma transacción.
      await tx.delete(campaignImagesTable).where(eq(campaignImagesTable.campaignId, id));
      await tx.delete(campaignUpdatesTable).where(eq(campaignUpdatesTable.campaignId, id));
      await tx.delete(campaignBudgetsTable).where(eq(campaignBudgetsTable.campaignId, id));
      await tx
        .delete(campaignEvidenceTable)
        .where(and(eq(campaignEvidenceTable.campaignId, id), sql`not (${protectedEvidenceCondition()})`));
      await tx
        .delete(campaignLeftoversTable)
        .where(and(eq(campaignLeftoversTable.campaignId, id), sql`not (${protectedLeftoverCondition()})`));

      await tx.delete(campaignsTable).where(eq(campaignsTable.id, id));

      return {
        kind: "deleted" as const,
        row: existing,
        deps,
        assets,
        unlinkedReports: unlinked.length,
      };
    });

    if (outcome.kind === "not_found") {
      return res.status(404).json({ error: "not_found", message: "Campaña no encontrada" });
    }
    if (outcome.kind === "blocked") {
      req.log.warn({ id, status: outcome.status, deps: outcome.deps }, "Campaign delete blocked");
      return res.status(409).json({
        error: "conflict",
        message: outcome.blocked,
        dependencies: outcome.deps,
        diagnostic: deleteDiagnostic(outcome.status, outcome.deps),
      });
    }

    // Post-transacción: la base YA está consistente. Aquí solo quedan efectos
    // externos, todos best-effort.
    await clearProtagonistIfMatches(id);
    const cleanup = await cleanupCloudinaryAssets(outcome.assets, req.log);

    if (outcome.unlinkedReports > 0) {
      await logAuditAction({
        ...auditContext(req),
        action: AUDIT_ACTIONS.campaignReportsUnlinked,
        resource: AUDIT_RESOURCES.campaigns,
        resourceId: String(id),
        details: { reports: outcome.unlinkedReports },
      });
    }
    // Auditoría (Fase 4): el borrado permanente queda trazado (título y estado
    // originales, para que el registro siga siendo útil tras el borrado).
    await logAuditAction({
      ...auditContext(req),
      action: AUDIT_ACTIONS.campaignDeleted,
      resource: AUDIT_RESOURCES.campaigns,
      resourceId: String(id),
      details: {
        title: outcome.row.title,
        status: outcome.row.status,
        removed: outcome.deps,
        unlinkedReports: outcome.unlinkedReports,
        assetsRemoved: cleanup.deleted,
        assetsFailed: cleanup.failed,
      },
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

/**
 * GET /campaigns/:id/test-purge/preview — vista previa de la Modalidad C
 * (Fase 1.3). Muestra exactamente qué se borraría y si la purga está permitida.
 * No modifica nada.
 */
router.get("/campaigns/:id/test-purge/preview", requireAdmin, adminActionLimiter, async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    return res.status(400).json({ error: "validation_error", message: "Identificador inválido" });
  }
  try {
    const preview = await db.transaction(async (tx) => {
      const [existing] = await tx.select().from(campaignsTable).where(eq(campaignsTable.id, id));
      if (!existing) return null;
      const deps = await countCampaignDependencies(tx, id);
      const [confirmedRow] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(donationsTable)
        .where(and(eq(donationsTable.campaignId, id), inArray(donationsTable.status, [...CONFIRMED_DONATION_STATUSES])));
      const confirmedDonations = confirmedRow?.n ?? 0;

      const blockReason = testPurgeBlockReason(existing.status, deps, confirmedDonations);
      return {
        id,
        title: existing.title,
        status: existing.status,
        dependencies: deps,
        confirmedDonations,
        wouldDelete: {
          donations: Math.max(0, deps.donations - confirmedDonations),
          images: deps.images,
          updates: deps.updates,
          budgets: deps.budgets,
          evidence: deps.auxiliaryEvidence,
          leftovers: deps.auxiliaryLeftovers,
        },
        wouldUnlink: { communityReports: deps.communityReports },
        allowed: blockReason === null,
        blockReason,
      };
    });
    if (!preview) {
      return res.status(404).json({ error: "not_found", message: "Campaña no encontrada" });
    }
    res.setHeader("Cache-Control", "private, no-store");
    return res.json(preview);
  } catch (err) {
    req.log.error({ err }, "Failed to build test purge preview");
    return res.status(500).json({ error: "server_error", message: "No se pudo preparar la purga" });
  }
});

/**
 * Motivo por el que la Modalidad C (purga de datos de prueba) no está permitida,
 * o `null` si lo está. Nunca permite destruir contabilidad: exige borrador, sin
 * asientos en el libro, sin gastos y sin donaciones confirmadas (dinero real).
 */
function testPurgeBlockReason(
  status: string,
  deps: CampaignDependencies,
  confirmedDonations: number,
): string | null {
  if (status !== "draft") {
    return `Solo se pueden purgar datos de prueba de un borrador. La campaña está ${status}.`;
  }
  if (deps.movements > 0) {
    return "La campaña tiene asientos en el libro contable: no admite purga de datos de prueba.";
  }
  if (deps.expenses > 0) {
    return "La campaña tiene gastos ejecutados registrados: requiere autorización contable, no una purga.";
  }
  if (confirmedDonations > 0) {
    return `La campaña tiene ${confirmedDonations} donación(es) confirmada(s) (dinero real): archívala para conservar el historial.`;
  }
  return null;
}

/**
 * POST /campaigns/:id/test-purge — Modalidad C (Fase 1.3).
 *
 * Procedimiento ESPECIAL y reforzado para borradores con datos de prueba:
 *  - Exige rol superadmin (autorización reforzada) y confirmación explícita.
 *  - Exige un motivo escrito (queda en la auditoría).
 *  - Rechaza la operación si hay contabilidad real (asientos, gastos o
 *    donaciones confirmadas): esos casos se ARCHIVAN, nunca se purgan.
 *  - Registra la operación completa en la auditoría.
 * No existe ningún botón que borre donaciones, gastos o asientos a ciegas.
 */
router.post(
  "/campaigns/:id/test-purge",
  requireAdmin,
  requireRole(ROLES.SUPERADMIN),
  adminActionLimiter,
  async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) {
      return res.status(400).json({ error: "validation_error", message: "Identificador inválido" });
    }
    const body = (req.body ?? {}) as { confirm?: unknown; reason?: unknown };
    if (body.confirm !== true) {
      return res.status(400).json({
        error: "validation_error",
        message: "La purga exige confirmación explícita (confirm: true).",
      });
    }
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    if (reason.length < 10) {
      return res.status(400).json({
        error: "validation_error",
        message: "Indica el motivo de la purga (mínimo 10 caracteres). Queda registrado en la auditoría.",
      });
    }

    try {
      const outcome = await db.transaction(async (tx) => {
        const [existing] = await tx
          .select()
          .from(campaignsTable)
          .where(eq(campaignsTable.id, id))
          .for("update");
        if (!existing) return { kind: "not_found" as const };

        const deps = await countCampaignDependencies(tx, id);
        const [confirmedRow] = await tx
          .select({ n: sql<number>`count(*)::int` })
          .from(donationsTable)
          .where(and(eq(donationsTable.campaignId, id), inArray(donationsTable.status, [...CONFIRMED_DONATION_STATUSES])));
        const confirmedDonations = confirmedRow?.n ?? 0;

        const blockReason = testPurgeBlockReason(existing.status, deps, confirmedDonations);
        if (blockReason) {
          return { kind: "refused" as const, message: blockReason, deps };
        }

        const assets = await collectAssetUrls(tx, id, existing.imageUrl);
        const unlinked = await tx
          .update(communityReportsTable)
          .set({ campaignId: null, updatedAt: new Date() })
          .where(eq(communityReportsTable.campaignId, id))
          .returning({ id: communityReportsTable.id });

        await tx.delete(donationsTable).where(eq(donationsTable.campaignId, id));
        await tx.delete(campaignImagesTable).where(eq(campaignImagesTable.campaignId, id));
        await tx.delete(campaignUpdatesTable).where(eq(campaignUpdatesTable.campaignId, id));
        await tx.delete(campaignBudgetsTable).where(eq(campaignBudgetsTable.campaignId, id));
        await tx.delete(campaignEvidenceTable).where(eq(campaignEvidenceTable.campaignId, id));
        await tx.delete(campaignLeftoversTable).where(eq(campaignLeftoversTable.campaignId, id));
        await tx.delete(campaignsTable).where(eq(campaignsTable.id, id));

        return {
          kind: "purged" as const,
          row: existing,
          deps,
          assets,
          unlinkedReports: unlinked.length,
        };
      });

      if (outcome.kind === "not_found") {
        return res.status(404).json({ error: "not_found", message: "Campaña no encontrada" });
      }
      if (outcome.kind === "refused") {
        req.log.warn({ id, deps: outcome.deps }, "Campaign test purge refused");
        return res.status(409).json({ error: "conflict", message: outcome.message, dependencies: outcome.deps });
      }

      await clearProtagonistIfMatches(id);
      const cleanup = await cleanupCloudinaryAssets(outcome.assets, req.log);
      await logAuditAction({
        ...auditContext(req),
        action: AUDIT_ACTIONS.campaignTestPurged,
        resource: AUDIT_RESOURCES.campaigns,
        resourceId: String(id),
        details: {
          title: outcome.row.title,
          reason,
          removed: outcome.deps,
          unlinkedReports: outcome.unlinkedReports,
          assetsRemoved: cleanup.deleted,
          assetsFailed: cleanup.failed,
        },
      });
      return res.status(204).send();
    } catch (err) {
      if (isForeignKeyViolation(err)) {
        req.log.warn({ err }, "Campaign test purge blocked by ledger FK");
        return res.status(409).json({
          error: "conflict",
          message: "La campaña tiene movimientos registrados en el libro contable y no puede purgarse.",
        });
      }
      req.log.error({ err }, "Failed to purge campaign test data");
      return res.status(500).json({ error: "server_error", message: "No se pudo purgar los datos de prueba" });
    }
  },
);

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

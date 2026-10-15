import { Router, type IRouter } from "express";
import {
  db,
  campaignsTable,
  donationsTable,
  campaignExpensesTable,
  campaignMovementsTable,
  donorsTable,
  petsTable,
  adoptionRequestsTable,
  alliesTable,
  newsTable,
  communityReportsTable,
  certificatesTable,
  volunteersTable,
  campaignEvidenceTable,
  campaignImagesTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAdmin } from "../middleware/require-admin";
import { requireRole, ROLES } from "../middleware/roles";
import { adminActionLimiter, reauthLimiter } from "../middleware/rate-limit";
import { logAuditAction } from "../middleware/auth-utils";
import { AUDIT_ACTIONS, AUDIT_RESOURCES, auditContext } from "../lib/audit";
import { verifySuperadminReauth } from "../lib/admin-reauth";
import { csvFilename, toCsvDocument } from "../lib/csv";
import { toSafeAmount } from "../lib/amount-format";
import {
  PROTECTED_CAMPAIGNS_SETTING_KEY,
  classifyDemoData,
  findProtectedCandidates,
  isProtectedCampaign,
  type DemoWorld,
} from "../lib/demo-classification";
import {
  readProtectedCampaignIds,
  writeProtectedCampaignIds,
} from "../lib/protected-campaigns";
import {
  buildReconciliation,
  reconciliationCsvRows,
  type ReconciliationCsvRow,
} from "../lib/demo-inventory";

/**
 * Mantenimiento → Limpieza de datos DEMO (V9.1).
 *
 * Solo LEE y PREPARA: no elimina nada por su cuenta. Lo que hace:
 *
 *  1. INVENTARIO: clasifica cada registro de la base en real / DEMO confirmado /
 *     pendiente / protegido, con la evidencia de cada decisión (ver
 *     `lib/demo-classification.ts`).
 *  2. PROTECCIÓN de ChocoFest 2025/2026: resuelve sus IDs REALES contra la base y
 *     los guarda; a partir de ahí ninguna purga puede tocarlas (la protección es
 *     por ID, no por nombre: renombrar no desprotege).
 *  3. CONCILIACIÓN: descompone cada cifra del panel hasta el registro que la
 *     produce, con su clasificación, y la exporta a CSV.
 *  4. DECLARACIÓN DEMO en bloque: la afirmación explícita del superadmin que
 *     habilita la purga (con reautenticación y motivo). La purga en sí la ejecuta
 *     el flujo ya probado de `POST /campaigns/:id/demo-purge`, que ahora respeta
 *     la protección.
 *
 * Exclusivo del superadmin.
 */
const router: IRouter = Router();

const superadminOnly = [requireAdmin, requireRole(ROLES.SUPERADMIN)];

/**
 * Instantánea de la base que alimenta el inventario y la conciliación. Solo lee.
 * Los medios se traen crudos: la decisión de qué es relleno la toma la capa pura.
 */
async function loadDemoWorld(): Promise<DemoWorld> {
  const protectedCampaignIds = await readProtectedCampaignIds();

  const [
    campaigns,
    donations,
    expenses,
    movements,
    donors,
    pets,
    adoptionRequests,
    allies,
    news,
    reports,
    certificates,
    volunteers,
    evidence,
    images,
  ] = await Promise.all([
    db
      .select({
        id: campaignsTable.id,
        title: campaignsTable.title,
        status: campaignsTable.status,
        isDemo: campaignsTable.isDemo,
        raised: campaignsTable.raised,
      })
      .from(campaignsTable),
    db
      .select({
        id: donationsTable.id,
        campaignId: donationsTable.campaignId,
        amount: donationsTable.amount,
        status: donationsTable.status,
        email: donationsTable.email,
        reconciledAt: donationsTable.reconciledAt,
        receiptUrl: donationsTable.receiptUrl,
        createdAt: donationsTable.createdAt,
      })
      .from(donationsTable),
    db
      .select({
        id: campaignExpensesTable.id,
        campaignId: campaignExpensesTable.campaignId,
        description: campaignExpensesTable.description,
        amount: campaignExpensesTable.amount,
        date: campaignExpensesTable.date,
        receiptUrl: campaignExpensesTable.receiptUrl,
      })
      .from(campaignExpensesTable),
    db
      .select({
        id: campaignMovementsTable.id,
        campaignId: campaignMovementsTable.campaignId,
        kind: campaignMovementsTable.kind,
        amount: campaignMovementsTable.amount,
        sourceType: campaignMovementsTable.sourceType,
        sourceId: campaignMovementsTable.sourceId,
      })
      .from(campaignMovementsTable),
    db
      .select({ id: donorsTable.id, name: donorsTable.name, email: donorsTable.email })
      .from(donorsTable),
    db
      .select({ id: petsTable.id, name: petsTable.name, status: petsTable.status, photos: petsTable.photos })
      .from(petsTable),
    db
      .select({
        id: adoptionRequestsTable.id,
        petId: adoptionRequestsTable.petId,
        status: adoptionRequestsTable.status,
      })
      .from(adoptionRequestsTable),
    db
      .select({ id: alliesTable.id, name: alliesTable.name, logo: alliesTable.logo })
      .from(alliesTable),
    db
      .select({ id: newsTable.id, title: newsTable.title, imageUrl: newsTable.imageUrl })
      .from(newsTable),
    db
      .select({
        id: communityReportsTable.id,
        title: communityReportsTable.title,
        status: communityReportsTable.status,
        campaignId: communityReportsTable.campaignId,
      })
      .from(communityReportsTable),
    db
      .select({
        id: certificatesTable.id,
        code: certificatesTable.code,
        status: certificatesTable.status,
        campaignId: certificatesTable.campaignId,
      })
      .from(certificatesTable),
    db
      .select({ id: volunteersTable.id, name: volunteersTable.name, status: volunteersTable.status })
      .from(volunteersTable),
    db
      .select({
        id: campaignEvidenceTable.id,
        campaignId: campaignEvidenceTable.campaignId,
        title: campaignEvidenceTable.title,
        mediaUrl: campaignEvidenceTable.mediaUrl,
      })
      .from(campaignEvidenceTable),
    db
      .select({
        id: campaignImagesTable.id,
        campaignId: campaignImagesTable.campaignId,
        imageUrl: campaignImagesTable.imageUrl,
      })
      .from(campaignImagesTable),
  ]);

  return {
    protectedCampaignIds,
    campaigns: campaigns.map((row) => ({
      id: row.id,
      title: row.title,
      status: row.status,
      isDemo: row.isDemo === true,
      raised: row.raised === null ? null : toSafeAmount(row.raised),
    })),
    donations: donations.map((row) => ({
      id: row.id,
      campaignId: row.campaignId,
      amount: toSafeAmount(row.amount),
      status: row.status,
      email: row.email,
      reconciledAt: row.reconciledAt,
      receiptUrl: row.receiptUrl,
      createdAt: row.createdAt,
    })),
    expenses: expenses.map((row) => ({
      id: row.id,
      campaignId: row.campaignId,
      description: row.description,
      amount: toSafeAmount(row.amount),
      date: row.date,
      receiptUrl: row.receiptUrl,
    })),
    movements: movements.map((row) => ({
      id: row.id,
      campaignId: row.campaignId,
      kind: row.kind,
      amount: toSafeAmount(row.amount),
      sourceType: row.sourceType,
      sourceId: row.sourceId,
    })),
    donors: donors.map((row) => ({ id: row.id, name: row.name, email: row.email ?? "" })),
    pets: pets.map((row) => ({
      id: row.id,
      name: row.name,
      status: row.status,
      photos: row.photos ?? [],
    })),
    adoptionRequests: adoptionRequests.map((row) => ({
      id: row.id,
      petId: row.petId,
      status: row.status,
    })),
    allies: allies.map((row) => ({ id: row.id, name: row.name, logoUrl: row.logo })),
    news: news.map((row) => ({ id: row.id, title: row.title, imageUrl: row.imageUrl })),
    reports: reports.map((row) => ({
      id: row.id,
      title: row.title,
      status: row.status,
      campaignId: row.campaignId,
    })),
    certificates: certificates.map((row) => ({
      id: row.id,
      code: row.code,
      status: row.status,
      campaignId: row.campaignId,
    })),
    volunteers: volunteers.map((row) => ({ id: row.id, name: row.name, status: row.status })),
    evidence: evidence.map((row) => ({
      id: row.id,
      campaignId: row.campaignId,
      title: row.title,
      mediaUrl: row.mediaUrl,
    })),
    images: images.map((row) => ({
      id: row.id,
      campaignId: row.campaignId,
      imageUrl: row.imageUrl,
    })),
  };
}

/** GET /admin/maintenance/inventory — inventario integral clasificado. */
router.get("/admin/maintenance/inventory", ...superadminOnly, adminActionLimiter, async (req, res) => {
  try {
    const world = await loadDemoWorld();
    const inventory = classifyDemoData(world);
    const candidates = findProtectedCandidates(
      world.campaigns.map((c) => ({ id: c.id, title: c.title })),
    );

    res.setHeader("Cache-Control", "private, no-store");
    return res.json({
      generatedAt: new Date().toISOString(),
      inventory,
      protection: {
        protectedCampaignIds: world.protectedCampaignIds,
        /** Candidatas detectadas por el patrón documentado, pendientes de confirmar. */
        candidates,
        /** Campañas que NO están protegidas y por tanto entran en una purga. */
        unprotectedCampaignIds: world.campaigns
          .filter((c) => !isProtectedCampaign(c.id, world.protectedCampaignIds))
          .map((c) => c.id),
      },
    });
  } catch (err) {
    req.log.error({ err }, "Failed to build demo inventory");
    return res
      .status(500)
      .json({ error: "server_error", message: "No se pudo construir el inventario" });
  }
});

/** GET /admin/maintenance/reconciliation[.csv] — conciliación de las cifras. */
router.get(
  "/admin/maintenance/reconciliation",
  ...superadminOnly,
  adminActionLimiter,
  async (req, res) => {
    try {
      const world = await loadDemoWorld();
      const statusFilter = typeof req.query.status === "string" ? req.query.status : null;
      const report = buildReconciliation(world, { statusFilter });

      if (req.query.format === "csv" || req.path.endsWith(".csv")) {
        const rows = reconciliationCsvRows(report);
        const csv = toCsvDocument<ReconciliationCsvRow>(
          [
            { header: "Figura", value: (r) => r.figura },
            { header: "Campaña", value: (r) => r.campana },
            { header: "ID campaña", value: (r) => r.campanaId },
            { header: "Tipo", value: (r) => r.tipo },
            { header: "Referencia", value: (r) => r.referencia },
            { header: "Fecha", value: (r) => r.fecha },
            { header: "Estado", value: (r) => r.estado },
            { header: "Importe", value: (r) => r.importe },
            { header: "Clasificación", value: (r) => r.clasificacion },
            { header: "Evidencia", value: (r) => r.evidencia },
          ],
          rows,
        );
        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader("Cache-Control", "private, no-store");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="${csvFilename("conciliacion-demo")}"`,
        );
        return res.send(csv);
      }

      res.setHeader("Cache-Control", "private, no-store");
      return res.json(report);
    } catch (err) {
      req.log.error({ err }, "Failed to build reconciliation");
      return res
        .status(500)
        .json({ error: "server_error", message: "No se pudo conciliar las cifras" });
    }
  },
);

/**
 * POST /admin/maintenance/protect-campaigns — fija la protección de ChocoFest.
 *
 * Resuelve las candidatas por el patrón documentado y guarda sus IDs. El
 * superadmin puede añadir IDs concretos, pero NUNCA quitar los ya protegidos sin
 * decirlo: la petición trae la lista completa que quiere dejar protegida.
 */
router.post(
  "/admin/maintenance/protect-campaigns",
  ...superadminOnly,
  reauthLimiter,
  adminActionLimiter,
  async (req, res) => {
    const body = (req.body ?? {}) as { confirm?: unknown; reason?: unknown; password?: unknown; totpCode?: unknown; campaignIds?: unknown };
    if (body.confirm !== true) {
      return res.status(400).json({
        error: "validation_error",
        code: "confirmation_required",
        message: "Confirmar la protección de campañas exige confirm: true.",
      });
    }
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    if (reason.length < 10) {
      return res.status(400).json({
        error: "validation_error",
        code: "reason_required",
        message: "Indica el motivo (mínimo 10 caracteres): queda en la auditoría.",
      });
    }
    const password = typeof body.password === "string" ? body.password : "";

    const sessionUser = req.session?.adminUser ?? null;
    const reauth = await verifySuperadminReauth({
      userId: sessionUser?.id ?? null,
      username: sessionUser?.username ?? null,
      password,
      totpCode: typeof body.totpCode === "string" ? body.totpCode : null,
    });
    if (!reauth.ok) {
      await logAuditAction({
        ...auditContext(req),
        action: AUDIT_ACTIONS.adminReauthFailed,
        resource: AUDIT_RESOURCES.campaigns,
        details: { operation: "protect_campaigns", code: reauth.code },
      });
      return res.status(401).json({ error: "unauthorized", code: reauth.code, message: reauth.message });
    }

    try {
      const [campaigns] = await Promise.all([
        db.select({ id: campaignsTable.id, title: campaignsTable.title }).from(campaignsTable),
      ]);
      const candidates = findProtectedCandidates(campaigns);
      const explicit = Array.isArray(body.campaignIds)
        ? body.campaignIds
            .map((value) => Number(value))
            .filter((id) => Number.isInteger(id) && id > 0)
        : [];
      const existing = await readProtectedCampaignIds();

      const known = new Set(campaigns.map((c) => c.id));
      const unknown = [...new Set([...candidates.map((c) => c.id), ...explicit])].filter(
        (id) => !known.has(id),
      );
      if (unknown.length > 0) {
        return res.status(400).json({
          error: "validation_error",
          message: `Campañas inexistentes: ${unknown.join(", ")}.`,
        });
      }

      // Unión: proteger es acumulativo; quitar una protección exige el flujo
      // explícito (no se desprotege por omisión en una petición de protección).
      const next = [...new Set([...existing, ...candidates.map((c) => c.id), ...explicit])].sort(
        (a, b) => a - b,
      );
      await writeProtectedCampaignIds(next);

      await logAuditAction({
        ...auditContext(req),
        action: AUDIT_ACTIONS.campaignsProtected,
        resource: AUDIT_RESOURCES.campaigns,
        details: {
          reason,
          protectedCampaignIds: next,
          resolvedFromPattern: candidates,
          addedExplicitly: explicit,
        },
      });

      return res.json({
        ok: true,
        protectedCampaignIds: next,
        protectedCampaigns: campaigns.filter((c) => next.includes(c.id)),
        candidates,
      });
    } catch (err) {
      req.log.error({ err }, "Failed to protect campaigns");
      return res
        .status(500)
        .json({ error: "server_error", message: "No se pudo fijar la protección" });
    }
  },
);

/**
 * POST /admin/maintenance/declare-demo — declaración DEMO en bloque.
 *
 * Es la afirmación explícita del superadmin («estos datos son de prueba») que
 * habilita la purga. No borra nada: solo marca. La purga la ejecuta después
 * `POST /campaigns/:id/demo-purge`, que vuelve a analizar los datos y respeta las
 * campañas protegidas.
 */
router.post(
  "/admin/maintenance/declare-demo",
  ...superadminOnly,
  reauthLimiter,
  adminActionLimiter,
  async (req, res) => {
    const body = (req.body ?? {}) as { confirm?: unknown; reason?: unknown; password?: unknown; totpCode?: unknown; campaignIds?: unknown };
    if (body.confirm !== true) {
      return res.status(400).json({
        error: "validation_error",
        code: "confirmation_required",
        message: "Declarar campañas DEMO exige confirm: true.",
      });
    }
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    if (reason.length < 10) {
      return res.status(400).json({
        error: "validation_error",
        code: "reason_required",
        message: "Indica el motivo (mínimo 10 caracteres): queda en la auditoría.",
      });
    }
    const ids = Array.isArray(body.campaignIds)
      ? [...new Set(body.campaignIds.map((v) => Number(v)).filter((id) => Number.isInteger(id) && id > 0))]
      : [];
    if (ids.length === 0) {
      return res.status(400).json({
        error: "validation_error",
        message: "Selecciona al menos una campaña.",
      });
    }

    const sessionUser = req.session?.adminUser ?? null;
    const reauth = await verifySuperadminReauth({
      userId: sessionUser?.id ?? null,
      username: sessionUser?.username ?? null,
      password: typeof body.password === "string" ? body.password : "",
      totpCode: typeof body.totpCode === "string" ? body.totpCode : null,
    });
    if (!reauth.ok) {
      await logAuditAction({
        ...auditContext(req),
        action: AUDIT_ACTIONS.adminReauthFailed,
        resource: AUDIT_RESOURCES.campaigns,
        details: { operation: "declare_demo_bulk", code: reauth.code },
      });
      return res.status(401).json({ error: "unauthorized", code: reauth.code, message: reauth.message });
    }

    try {
      const protectedIds = await readProtectedCampaignIds();
      const blocked = ids.filter((id) => protectedIds.includes(id));
      if (blocked.length > 0) {
        return res.status(409).json({
          error: "conflict",
          message: `Estas campañas están PROTEGIDAS y no se pueden declarar DEMO: ${blocked.join(", ")}. Quita la protección primero si de verdad procede.`,
          protectedCampaignIds: blocked,
        });
      }

      const updated: number[] = [];
      for (const id of ids) {
        const [row] = await db
          .update(campaignsTable)
          .set({ isDemo: true, demoMarkedAt: new Date(), demoMarkedBy: sessionUser?.username ?? null })
          .where(eq(campaignsTable.id, id))
          .returning({ id: campaignsTable.id, title: campaignsTable.title });
        if (row) updated.push(row.id);
      }

      await logAuditAction({
        ...auditContext(req),
        action: AUDIT_ACTIONS.campaignsDemoDeclaredBulk,
        resource: AUDIT_RESOURCES.campaigns,
        details: { reason, campaignIds: updated, requested: ids },
      });

      return res.json({ ok: true, declaredDemo: updated, requested: ids });
    } catch (err) {
      req.log.error({ err }, "Failed to declare campaigns as DEMO");
      return res
        .status(500)
        .json({ error: "server_error", message: "No se pudieron declarar las campañas" });
    }
  },
);

export default router;

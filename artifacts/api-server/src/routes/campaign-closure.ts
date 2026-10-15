import { Router, type IRouter } from "express";
import { createHash } from "node:crypto";
import {
  db,
  campaignsTable,
  donationsTable,
  campaignExpensesTable,
  campaignMovementsTable,
  campaignLeftoversTable,
  campaignClosuresTable,
} from "@workspace/db";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { requireAdmin } from "../middleware/require-admin";
import { requireRole, ROLES } from "../middleware/roles";
import { adminActionLimiter, reauthLimiter } from "../middleware/rate-limit";
import { logAuditAction } from "../middleware/auth-utils";
import { AUDIT_ACTIONS, AUDIT_RESOURCES, auditContext } from "../lib/audit";
import { verifySuperadminReauth } from "../lib/admin-reauth";
import { canonicalJson, normalizeForHash } from "../lib/campaign-demo-purge";
import { isOwnDocument } from "../lib/demo-classification";
import { CONFIRMED_DONATION_STATUSES } from "../lib/donor-identity";
import { toSafeAmount } from "../lib/amount-format";
import { verifyChain, type LedgerRow } from "../lib/ledger";
import {
  buildClosureReport,
  deriveClosureState,
  validateClosureRequest,
  type ClosureReport,
} from "../lib/campaign-closure";

/**
 * CIERRE FINANCIERO DE CAMPAÑA (V14-2.3).
 *
 * GET    /admin/campaigns/:id/closure          → revisión previa (informe + estado)
 * POST   /admin/campaigns/:id/closure          → cerrar (reauth + motivo)
 * POST   /admin/campaigns/:id/closure/reopen   → reabrir (solo superadmin + reauth)
 * GET    /admin/campaigns/:id/closure/report   → informe congelado del último cierre
 *
 * Las decisiones de negocio están documentadas en `lib/campaign-closure.ts`. El
 * bloqueo posterior al cierre lo aplica `assertCampaignOpen`, que usan las rutas que
 * escriben contabilidad.
 */
const router: IRouter = Router();

const adminRoles = [requireAdmin, requireRole(ROLES.ADMIN)];
const superadminRoles = [requireAdmin, requireRole(ROLES.SUPERADMIN)];
const MIN_REASON = 10;

/** Historial de cierres de una campaña (append-only, del más nuevo al más viejo). */
export async function loadClosureEvents(campaignId: number) {
  return db
    .select({
      id: campaignClosuresTable.id,
      event: campaignClosuresTable.event,
      reason: campaignClosuresTable.reason,
      performedBy: campaignClosuresTable.performedBy,
      createdAt: campaignClosuresTable.createdAt,
      report: campaignClosuresTable.report,
      manifestHash: campaignClosuresTable.manifestHash,
    })
    .from(campaignClosuresTable)
    .where(eq(campaignClosuresTable.campaignId, campaignId))
    .orderBy(asc(campaignClosuresTable.id));
}

/**
 * ¿Está cerrada la campaña? Lo consultan las rutas que escriben contabilidad.
 * Exportado para que el bloqueo viva en un solo sitio.
 */
export async function isCampaignClosed(campaignId: number): Promise<boolean> {
  const events = await loadClosureEvents(campaignId);
  return deriveClosureState(events).closed;
}

/** Mensaje estándar del bloqueo, para no repetirlo en cada ruta. */
export function closedCampaignError(): { error: string; code: string; message: string } {
  return {
    error: "conflict",
    code: "campaign_closed",
    message:
      "La campaña tiene un cierre financiero firmado: no se puede modificar su contabilidad. Reábrela (solo un superadministrador) o registra un asiento compensatorio.",
  };
}

/** Reúne todo lo que el informe de cierre necesita. */
async function loadClosureInput(campaignId: number) {
  const [campaign] = await db
    .select()
    .from(campaignsTable)
    .where(eq(campaignsTable.id, campaignId));
  if (!campaign) return null;

  const [donations, expenses, leftovers, movements] = await Promise.all([
    db
      .select({
        id: donationsTable.id,
        amount: donationsTable.amount,
        status: donationsTable.status,
        reconciledAt: donationsTable.reconciledAt,
        paymentMethod: donationsTable.paymentMethod,
        collaborationType: donationsTable.collaborationType,
      })
      .from(donationsTable)
      .where(eq(donationsTable.campaignId, campaignId)),
    db
      .select({
        id: campaignExpensesTable.id,
        amount: campaignExpensesTable.amount,
        description: campaignExpensesTable.description,
        receiptUrl: campaignExpensesTable.receiptUrl,
      })
      .from(campaignExpensesTable)
      .where(eq(campaignExpensesTable.campaignId, campaignId)),
    db
      .select({
        id: campaignLeftoversTable.id,
        quantity: campaignLeftoversTable.quantity,
        receivedQty: campaignLeftoversTable.receivedQty,
        usedQty: campaignLeftoversTable.usedQty,
      })
      .from(campaignLeftoversTable)
      .where(eq(campaignLeftoversTable.campaignId, campaignId)),
    db.select().from(campaignMovementsTable).where(eq(campaignMovementsTable.campaignId, campaignId)),
  ]);

  const chainRows: LedgerRow[] = movements.map((row) => ({
    id: row.id,
    kind: row.kind,
    amount: toSafeAmount(row.amount),
    description: row.description,
    sourceType: row.sourceType,
    sourceId: row.sourceId,
    createdAt: row.createdAt,
    prevHash: row.prevHash,
    hash: row.hash,
  }));
  const chain = verifyChain(chainRows);

  // Hallazgos del libro que afectan a ESTA campaña.
  const movementBySource = new Set(
    movements
      .filter((row) => row.sourceType === "donation")
      .map((row) => Number(row.sourceId)),
  );
  const confirmed = donations.filter((donation) =>
    (CONFIRMED_DONATION_STATUSES as readonly string[]).includes(donation.status),
  );
  const donationsWithoutMovement = confirmed.filter(
    (donation) => !movementBySource.has(donation.id),
  ).length;
  const expenseIds = new Set(expenses.map((expense) => expense.id));
  const orphanMovements = movements.filter(
    (row) => row.sourceType === "expense" && !expenseIds.has(Number(row.sourceId)),
  ).length;

  const report: ClosureReport = buildClosureReport({
    campaign: {
      id: campaign.id,
      title: campaign.title,
      status: campaign.status,
      goal: campaign.goal === null ? null : toSafeAmount(campaign.goal),
      raised: campaign.raised === null ? null : toSafeAmount(campaign.raised),
    },
    donations: donations.map((donation) => ({
      id: donation.id,
      amount: toSafeAmount(donation.amount),
      status: donation.status,
      reconciledAt: donation.reconciledAt,
      paymentMethod: donation.paymentMethod,
      collaborationType: donation.collaborationType,
    })),
    expenses: expenses.map((expense) => ({
      id: expense.id,
      amount: toSafeAmount(expense.amount),
      description: expense.description,
      receiptUrl: expense.receiptUrl,
    })),
    leftovers: leftovers.map((item) => ({
      id: item.id,
      quantity: item.quantity,
      receivedQty: item.receivedQty,
      usedQty: item.usedQty,
    })),
    ledger: {
      verified: chain.verified,
      movementCount: movements.length,
      rootHash: chain.rootHash,
      donationsWithoutMovement,
      orphanMovements,
    },
    isOwnDocument,
  });

  return { campaign, report };
}

function parseId(raw: unknown): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** GET /admin/campaigns/:id/closure — revisión previa al cierre. */
router.get(
  "/admin/campaigns/:id/closure",
  ...adminRoles,
  adminActionLimiter,
  async (req, res) => {
    const campaignId = parseId(req.params.id);
    if (campaignId === null) {
      return res.status(400).json({ error: "validation_error", message: "Identificador inválido" });
    }
    try {
      const loaded = await loadClosureInput(campaignId);
      if (!loaded) return res.status(404).json({ error: "not_found", message: "Campaña no encontrada" });
      const state = deriveClosureState(await loadClosureEvents(campaignId));
      res.setHeader("Cache-Control", "private, no-store");
      return res.json({ report: loaded.report, state });
    } catch (err) {
      req.log.error({ err }, "Failed to build closure preview");
      return res.status(500).json({ error: "server_error", message: "No se pudo revisar la campaña" });
    }
  },
);

/** POST /admin/campaigns/:id/closure — cerrar (acto firmado). */
router.post(
  "/admin/campaigns/:id/closure",
  ...adminRoles,
  reauthLimiter,
  adminActionLimiter,
  async (req, res) => {
    const campaignId = parseId(req.params.id);
    if (campaignId === null) {
      return res.status(400).json({ error: "validation_error", message: "Identificador inválido" });
    }
    try {
      const loaded = await loadClosureInput(campaignId);
      if (!loaded) return res.status(404).json({ error: "not_found", message: "Campaña no encontrada" });

      const state = deriveClosureState(await loadClosureEvents(campaignId));
      const parsed = validateClosureRequest(req.body, {
        canClose: loaded.report.canClose,
        blockers: loaded.report.blockers,
        alreadyClosed: state.closed,
      });
      if (!parsed.ok) {
        return res.status(parsed.status).json({ error: parsed.code, code: parsed.code, message: parsed.message });
      }

      const sessionUser = req.session?.adminUser ?? null;
      const body = (req.body ?? {}) as Record<string, unknown>;
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
          resourceId: String(campaignId),
          details: { operation: "campaign_closure", code: reauth.code },
        });
        return res.status(401).json({ error: "unauthorized", code: reauth.code, message: reauth.message });
      }

      // El informe se congela con su hash: un cierre pasado no cambia después.
      const reportWithFirm = {
        ...loaded.report,
        signedBy: sessionUser?.username ?? null,
        signedById: sessionUser ? String(sessionUser.id) : null,
      };
      const manifestHash = createHash("sha256")
        .update(canonicalJson(normalizeForHash(reportWithFirm)))
        .digest("hex");

      const [closure] = await db
        .insert(campaignClosuresTable)
        .values({
          campaignId,
          event: "closed",
          reason: parsed.reason,
          report: reportWithFirm,
          manifestHash,
          performedBy: sessionUser?.username ?? null,
          performedById: sessionUser ? String(sessionUser.id) : null,
        })
        .returning({ id: campaignClosuresTable.id, createdAt: campaignClosuresTable.createdAt });

      await logAuditAction({
        ...auditContext(req),
        action: AUDIT_ACTIONS.campaignClosed,
        resource: AUDIT_RESOURCES.campaigns,
        resourceId: String(campaignId),
        details: {
          reason: parsed.reason,
          closureId: closure?.id ?? null,
          manifestHash,
          figures: loaded.report.figures,
          warnings: loaded.report.warnings,
          withSalvedades: loaded.report.withSalvedades,
        },
      });

      return res.status(201).json({
        ok: true,
        closureId: closure?.id ?? null,
        manifestHash,
        withSalvedades: loaded.report.withSalvedades,
        warnings: loaded.report.warnings,
        figures: loaded.report.figures,
        message: loaded.report.withSalvedades
          ? "Campaña cerrada CON SALVEDADES (quedan registradas en el informe)."
          : "Campaña cerrada.",
      });
    } catch (err) {
      req.log.error({ err }, "Failed to close campaign");
      return res.status(500).json({ error: "server_error", message: "No se pudo cerrar la campaña" });
    }
  },
);

/** POST /admin/campaigns/:id/closure/reopen — reabrir (solo superadmin). */
router.post(
  "/admin/campaigns/:id/closure/reopen",
  ...superadminRoles,
  reauthLimiter,
  adminActionLimiter,
  async (req, res) => {
    const campaignId = parseId(req.params.id);
    if (campaignId === null) {
      return res.status(400).json({ error: "validation_error", message: "Identificador inválido" });
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    if (body.confirm !== true || reason.length < MIN_REASON) {
      return res.status(400).json({
        error: "validation_error",
        code: body.confirm !== true ? "confirmation_required" : "reason_required",
        message: `Reabrir exige confirm: true y un motivo de ${MIN_REASON}+ caracteres: queda auditado.`,
      });
    }
    try {
      const state = deriveClosureState(await loadClosureEvents(campaignId));
      if (!state.closed) {
        return res.status(409).json({
          error: "conflict",
          code: "not_closed",
          message: "La campaña no está cerrada.",
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
        return res.status(401).json({ error: "unauthorized", code: reauth.code, message: reauth.message });
      }

      const [event] = await db
        .insert(campaignClosuresTable)
        .values({
          campaignId,
          event: "reopened",
          reason,
          report: { reopenedAt: new Date().toISOString(), previousClosureId: state.lastEvent?.createdAt ?? null },
          manifestHash: "",
          performedBy: sessionUser?.username ?? null,
          performedById: sessionUser ? String(sessionUser.id) : null,
        })
        .returning({ id: campaignClosuresTable.id });

      await logAuditAction({
        ...auditContext(req),
        action: AUDIT_ACTIONS.campaignReopened,
        resource: AUDIT_RESOURCES.campaigns,
        resourceId: String(campaignId),
        details: { reason, reopeningId: event?.id ?? null, closureCount: state.closureCount },
      });

      return res.json({ ok: true, reopeningId: event?.id ?? null, message: "Campaña reabierta." });
    } catch (err) {
      req.log.error({ err }, "Failed to reopen campaign");
      return res.status(500).json({ error: "server_error", message: "No se pudo reabrir la campaña" });
    }
  },
);

/** GET /admin/campaigns/:id/closure/report — informe congelado y su verificación. */
router.get(
  "/admin/campaigns/:id/closure/report",
  ...adminRoles,
  adminActionLimiter,
  async (req, res) => {
    const campaignId = parseId(req.params.id);
    if (campaignId === null) {
      return res.status(400).json({ error: "validation_error", message: "Identificador inválido" });
    }
    try {
      const events = await loadClosureEvents(campaignId);
      const lastClosure = [...events].reverse().find((row) => row.event === "closed");
      if (!lastClosure) {
        return res.status(404).json({ error: "not_found", message: "La campaña no tiene ningún cierre registrado." });
      }
      const recomputed = createHash("sha256")
        .update(canonicalJson(normalizeForHash(lastClosure.report)))
        .digest("hex");
      res.setHeader("Cache-Control", "private, no-store");
      return res.json({
        closureId: lastClosure.id,
        closedAt: lastClosure.createdAt,
        closedBy: lastClosure.performedBy,
        reason: lastClosure.reason,
        report: lastClosure.report,
        manifestHash: lastClosure.manifestHash,
        // Si el informe se hubiera alterado después, esto lo delata.
        manifestVerified: recomputed === lastClosure.manifestHash,
        state: deriveClosureState(events),
      });
    } catch (err) {
      req.log.error({ err }, "Failed to read closure report");
      return res.status(500).json({ error: "server_error", message: "No se pudo leer el informe" });
    }
  },
);

export default router;

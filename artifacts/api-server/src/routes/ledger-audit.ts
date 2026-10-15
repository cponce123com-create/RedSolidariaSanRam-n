import { Router, type IRouter } from "express";
import {
  db,
  campaignMovementsTable,
  donationsTable,
  campaignExpensesTable,
} from "@workspace/db";
import { and, asc, eq, inArray } from "drizzle-orm";
import { requireAdmin } from "../middleware/require-admin";
import { requireRole, ROLES } from "../middleware/roles";
import { adminActionLimiter } from "../middleware/rate-limit";
import { logAuditAction } from "../middleware/auth-utils";
import { AUDIT_ACTIONS, AUDIT_RESOURCES, auditContext } from "../lib/audit";
import { appendMovement, verifyCampaignChains } from "../lib/ledger";
import { auditLedger, type LedgerAuditReport } from "../lib/ledger-audit";
import { isConfirmedDonationStatus } from "../lib/donor-identity";
import {
  planRegularization,
  validateRegularizationRequest,
} from "../lib/ledger-regularization";
import { toCsvDocument, csvFilename } from "../lib/csv";
import { roundMoney } from "../lib/funding";

const router: IRouter = Router();

// Estados de donación que deben tener asiento en el libro. Las aprobadas son
// terminales (no se pueden desaprobar), así que un movimiento solo puede
// referirse a una donación de esta lista.
const CONFIRMED_STATUSES = ["approved", "reconciled"] as const;

/**
 * Construye el informe de integridad a partir del estado actual de la base.
 * Solo lee: ni corrige ni escribe. Se reutiliza tanto para el informe como para
 * la vista previa de regularización.
 */
async function buildAuditReport(): Promise<{
  report: LedgerAuditReport;
  confirmedDonations: { id: number; campaignId: number | null; amount: number }[];
  expenseCount: number;
}> {
  const [movements, allDonations, expenses] = await Promise.all([
    db
      .select()
      .from(campaignMovementsTable)
      .orderBy(asc(campaignMovementsTable.id)),
    db
      .select({
        id: donationsTable.id,
        campaignId: donationsTable.campaignId,
        amount: donationsTable.amount,
        status: donationsTable.status,
      })
      .from(donationsTable),
    db
      .select({
        id: campaignExpensesTable.id,
        campaignId: campaignExpensesTable.campaignId,
        amount: campaignExpensesTable.amount,
      })
      .from(campaignExpensesTable),
  ]);

  // Solo las confirmadas deben tener asiento: es la lista que usa la
  // regularización (DB-09) y NO debe incluir una donación anulada, o la
  // regularización le crearía un ingreso que ya se compensó.
  const confirmedDonations = allDonations
    .filter((d) => isConfirmedDonationStatus(d.status))
    .map((d) => ({ id: d.id, campaignId: d.campaignId, amount: d.amount }));

  const report = auditLedger({
    movements,
    // Se pasan TODAS las donaciones con su bandera `confirmed`, no solo las
    // confirmadas: el ASIENTO COMPENSATORIO de una anulación contable
    // (`sourceType = 'donation_reversal'`) tiene como origen una donación que ya
    // no está confirmada pero que SIGUE EXISTIENDO. Sin ella, el informe lo
    // señalaría como asiento huérfano y el libro parecería descuadrado.
    donations: allDonations.map((d) => ({
      id: d.id,
      campaignId: d.campaignId,
      amount: d.amount,
      confirmed: isConfirmedDonationStatus(d.status),
    })),
    expenses,
    // La cadena es independiente por campaña: se agrupa antes de verificar.
    chain: verifyCampaignChains(movements),
  });

  return { report, confirmedDonations, expenseCount: expenses.length };
}

/**
 * GET /admin/ledger/audit — informe de integridad del libro contable (Fase 1.4
 * del Prompt Maestro V7).
 *
 * SOLO LECTURA: no corrige ni escribe nada. La cadena de hashes puede verificar
 * y el libro seguir incompleto (donaciones confirmadas sin asiento, hallazgo
 * DB-09), así que el informe coteja el libro con sus orígenes y señala:
 * cadena rota, donaciones confirmadas sin asiento, asientos sin origen,
 * importes descuadrados, asientos en otra campaña que su origen y saldos
 * descuadrados.
 *
 * Cualquier corrección posterior debe hacerse con un asiento compensatorio
 * autorizado y trazable: el libro es append-only y no se edita.
 */
router.get("/admin/ledger/audit", requireAdmin, adminActionLimiter, async (req, res) => {
  try {
    const { report, confirmedDonations, expenseCount } = await buildAuditReport();

    return res.json({
      ...report,
      generatedAt: new Date().toISOString(),
      // Trazabilidad de lo que se auditó: un informe sin contexto no es
      // verificable por un tercero.
      audited: {
        movements: report.movementCount,
        confirmedDonations: confirmedDonations.length,
        expenses: expenseCount,
        confirmedStatuses: [...CONFIRMED_STATUSES],
      },
    });
  } catch (err) {
    req.log.error({ err }, "Failed to audit ledger");
    return res
      .status(500)
      .json({ error: "server_error", message: "No se pudo auditar el libro contable" });
  }
});

/**
 * GET /admin/ledger/regularize/preview — plan de regularización (Fase 2, V7.1).
 *
 * Describe, sin escribir nada, qué asientos compensatorios se apilarían para
 * cerrar las discrepancias: donaciones confirmadas sin asiento con campaña. Las
 * donaciones sin campaña se informan como no regularizables. El administrador
 * revisa el plan antes de autorizar la operación.
 */
router.get(
  "/admin/ledger/regularize/preview",
  requireAdmin,
  requireRole(ROLES.SUPERADMIN),
  adminActionLimiter,
  async (req, res) => {
    try {
      const { report } = await buildAuditReport();
      const plan = planRegularization(report.donationsWithoutMovement);
      return res.json({
        plan,
        healthy: report.healthy,
        generatedAt: new Date().toISOString(),
      });
    } catch (err) {
      req.log.error({ err }, "Failed to build regularization plan");
      return res
        .status(500)
        .json({ error: "server_error", message: "No se pudo preparar la regularización" });
    }
  },
);

/**
 * POST /admin/ledger/regularize — regularización autorizada (Fase 2, V7.1).
 *
 * Apila asientos compensatorios para las donaciones confirmadas sin asiento. NO
 * edita ni borra historial: el libro es append-only y la corrección queda como
 * una entrada nueva encadenada. Exige rol superadmin, confirmación explícita, un
 * motivo escrito y una referencia de evidencia documental; todo queda auditado.
 *
 * La transacción es atómica: si una donación deja de ser regularizable entre la
 * validación y la escritura, se revierte el lote completo (nada a medias).
 */
router.post(
  "/admin/ledger/regularize",
  requireAdmin,
  requireRole(ROLES.SUPERADMIN),
  adminActionLimiter,
  async (req, res) => {
    const validation = validateRegularizationRequest(req.body);
    if (!validation.ok) {
      return res
        .status(400)
        .json({ error: "validation_error", message: validation.message });
    }
    const { donationIds, reason, evidenceRef } = validation.value;

    try {
      const outcome = await db.transaction(async (tx) => {
        // Solo donaciones CONFIRMADAS y con campaña entran al libro.
        const donations = await tx
          .select({
            id: donationsTable.id,
            campaignId: donationsTable.campaignId,
            amount: donationsTable.amount,
          })
          .from(donationsTable)
          .where(
            and(
              inArray(donationsTable.id, donationIds),
              inArray(donationsTable.status, [...CONFIRMED_STATUSES]),
            ),
          );

        if (donations.length !== donationIds.length) {
          return { kind: "invalid" as const };
        }

        // Las que ya tienen asiento no se tocan: el índice único por
        // (source_type, source_id) las protege, y aquí se filtran de entrada.
        const existing = await tx
          .select({ sourceId: campaignMovementsTable.sourceId })
          .from(campaignMovementsTable)
          .where(
            and(
              eq(campaignMovementsTable.sourceType, "donation"),
              inArray(campaignMovementsTable.sourceId, donationIds),
            ),
          );
        const alreadyPosted = new Set(existing.map((row) => row.sourceId));

        const pending = donations.filter((d) => !alreadyPosted.has(d.id));
        const plan = planRegularization(
          pending.map((d) => ({
            id: d.id,
            campaignId: d.campaignId,
            amount: d.amount,
          })),
        );

        const applied: { donationId: number; campaignId: number; amount: number }[] = [];
        const now = new Date();
        for (const entry of plan.entries) {
          await appendMovement(tx, entry.campaignId, {
            kind: entry.kind,
            amount: entry.amount,
            description: `${entry.description} · ${evidenceRef}`,
            sourceType: entry.sourceType,
            sourceId: entry.sourceId,
            createdAt: now,
          });
          applied.push({
            donationId: entry.sourceId,
            campaignId: entry.campaignId,
            amount: entry.amount,
          });
        }

        return {
          kind: "applied" as const,
          applied,
          skipped: plan.skipped,
          alreadyPosted: [...alreadyPosted],
        };
      });

      if (outcome.kind === "invalid") {
        return res.status(400).json({
          error: "validation_error",
          message:
            "Alguna donación no existe o no está confirmada (aprobada/conciliada). Solo se regularizan donaciones confirmadas.",
        });
      }

      const total = roundMoney(
        outcome.applied.reduce((sum, item) => sum + item.amount, 0),
      );

      await logAuditAction({
        ...auditContext(req),
        action: AUDIT_ACTIONS.ledgerRegularized,
        resource: AUDIT_RESOURCES.donations,
        resourceId: outcome.applied.map((item) => item.donationId).join(","),
        details: {
          donationIds: outcome.applied.map((item) => item.donationId),
          alreadyPosted: outcome.alreadyPosted,
          skipped: outcome.skipped,
          total,
          reason,
          evidenceRef,
        },
      });

      return res.json({
        applied: outcome.applied,
        alreadyPosted: outcome.alreadyPosted,
        skipped: outcome.skipped,
        total,
        reason,
        evidenceRef,
      });
    } catch (err) {
      req.log.error({ err }, "Failed to regularize ledger");
      return res
        .status(500)
        .json({ error: "server_error", message: "No se pudo regularizar el libro contable" });
    }
  },
);

/**
 * GET /admin/ledger/discrepancies.csv — informe de discrepancias descargable
 * (Fase 2, V7.1). Solo lectura; exporta en CSV (Excel/LibreOffice) todo lo que el
 * informe señala para que un auditor externo pueda revisarlo fuera del panel.
 */
router.get(
  "/admin/ledger/discrepancies.csv",
  requireAdmin,
  requireRole(ROLES.ADMIN, ROLES.SUPERVISOR),
  adminActionLimiter,
  async (req, res) => {
    try {
      const { report } = await buildAuditReport();

      interface Row {
        tipo: string;
        referencia: string;
        campana: string;
        importe: string;
        detalle: string;
      }
      const rows: Row[] = [];

      for (const d of report.donationsWithoutMovement) {
        rows.push({
          tipo: "donacion_sin_asiento",
          referencia: `donation:${d.id}`,
          campana: d.campaignId === null ? "sin campaña" : String(d.campaignId),
          importe: String(d.amount),
          detalle: "Donación confirmada sin asiento en el libro contable",
        });
      }
      for (const m of report.movementsWithoutSource) {
        rows.push({
          tipo: "asiento_sin_origen",
          referencia: `movement:${m.id}`,
          campana: "",
          importe: "",
          detalle: `Origen ${m.sourceType}:${m.sourceId} inexistente`,
        });
      }
      for (const m of report.amountMismatches) {
        rows.push({
          tipo: "importe_descuadrado",
          referencia: `movement:${m.movementId}`,
          campana: "",
          importe: `${m.movementAmount} vs ${m.sourceAmount}`,
          detalle: `Origen ${m.sourceType}:${m.sourceId}`,
        });
      }
      for (const m of report.campaignMismatches) {
        rows.push({
          tipo: "campana_descuadrada",
          referencia: `movement:${m.movementId}`,
          campana: `${m.movementCampaignId} vs ${m.sourceCampaignId ?? "sin campaña"}`,
          importe: "",
          detalle: `Origen ${m.sourceType}:${m.sourceId}`,
        });
      }
      for (const g of report.duplicateMovements) {
        rows.push({
          tipo: "asiento_duplicado",
          referencia: `${g.sourceType}:${g.sourceId}`,
          campana: "",
          importe: "",
          detalle: `Asientos ${g.movementIds.join(", ")} (${g.count})`,
        });
      }
      for (const campaignId of report.unbalancedCampaigns) {
        const totals = report.totals.find((item) => item.campaignId === campaignId);
        rows.push({
          tipo: "saldo_descuadrado",
          referencia: `campaign:${campaignId}`,
          campana: String(campaignId),
          importe: totals ? `${totals.ledgerNet} vs ${totals.sourceNet}` : "",
          detalle: "El saldo del libro no cuadra con sus orígenes",
        });
      }

      const csv = toCsvDocument(
        [
          { header: "Tipo", value: (r: Row) => r.tipo },
          { header: "Referencia", value: (r: Row) => r.referencia },
          { header: "Campaña", value: (r: Row) => r.campana },
          { header: "Importe", value: (r: Row) => r.importe },
          { header: "Detalle", value: (r: Row) => r.detalle },
        ],
        rows,
      );

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Cache-Control", "private, no-store");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${csvFilename("discrepancias-libro")}"`,
      );
      return res.send(csv);
    } catch (err) {
      req.log.error({ err }, "Failed to export ledger discrepancies");
      return res
        .status(500)
        .json({ error: "server_error", message: "No se pudo exportar las discrepancias" });
    }
  },
);

export default router;

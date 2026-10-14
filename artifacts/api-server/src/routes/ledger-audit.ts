import { Router, type IRouter } from "express";
import {
  db,
  campaignMovementsTable,
  donationsTable,
  campaignExpensesTable,
} from "@workspace/db";
import { asc, inArray } from "drizzle-orm";
import { requireAdmin } from "../middleware/require-admin";
import { adminActionLimiter } from "../middleware/rate-limit";
import { verifyChain } from "../lib/ledger";
import { auditLedger } from "../lib/ledger-audit";

const router: IRouter = Router();

// Estados de donación que deben tener asiento en el libro. Las aprobadas son
// terminales (no se pueden desaprobar), así que un movimiento solo puede
// referirse a una donación de esta lista.
const CONFIRMED_STATUSES = ["approved", "reconciled"] as const;

/**
 * GET /admin/ledger/audit — informe de integridad del libro contable (Fase 1.4
 * del Prompt Maestro V7).
 *
 * SOLO LECTURA: no corrige ni escribe nada. La cadena de hashes puede verificar
 * y el libro seguir incompleto (donaciones confirmadas sin asiento, hallazgo
 * DB-09), así que el informe coteja el libro con sus orígenes y señala:
 * cadena rota, donaciones confirmadas sin asiento, asientos sin origen,
 * importes descuadrados y asientos en otra campaña que su origen.
 *
 * Cualquier corrección posterior debe hacerse con un asiento compensatorio
 * autorizado y trazable: el libro es append-only y no se edita.
 */
router.get("/admin/ledger/audit", requireAdmin, adminActionLimiter, async (req, res) => {
  try {
    const [movements, confirmedDonations, expenses] = await Promise.all([
      db
        .select()
        .from(campaignMovementsTable)
        .orderBy(asc(campaignMovementsTable.id)),
      db
        .select({
          id: donationsTable.id,
          campaignId: donationsTable.campaignId,
          amount: donationsTable.amount,
        })
        .from(donationsTable)
        .where(inArray(donationsTable.status, [...CONFIRMED_STATUSES])),
      db
        .select({
          id: campaignExpensesTable.id,
          campaignId: campaignExpensesTable.campaignId,
          amount: campaignExpensesTable.amount,
        })
        .from(campaignExpensesTable),
    ]);

    const report = auditLedger({
      movements,
      donations: confirmedDonations.map((d) => ({ ...d, confirmed: true })),
      expenses,
      chain: verifyChain(movements),
    });

    return res.json({
      ...report,
      generatedAt: new Date().toISOString(),
      // Trazabilidad de lo que se auditó: un informe sin contexto no es
      // verificable por un tercero.
      audited: {
        movements: movements.length,
        confirmedDonations: confirmedDonations.length,
        expenses: expenses.length,
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

export default router;

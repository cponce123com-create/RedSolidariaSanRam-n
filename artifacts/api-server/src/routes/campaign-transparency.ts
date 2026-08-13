import { Router } from "express";
import { db } from "@workspace/db";
import {
  campaignsTable,
  donationsTable,
  campaignExpensesTable,
  campaignEvidenceTable,
  campaignMovementsTable,
  campaignLeftoversTable,
} from "@workspace/db";
import { eq, and, desc, sql } from "drizzle-orm";
import { toSafeAmount } from "../lib/amount-format";
import { toIsoSafe } from "../lib/date-format";
import { formatExpense } from "./campaign-expenses";
import { formatEvidence } from "./campaign-evidence";
import { formatLeftover } from "./campaign-leftovers";

const router = Router();

// GET /campaigns/:id/transparency — público.
// Arma el panel de transparencia de una campaña en UN solo request: agregados
// (recaudado, gastado, donantes) calculados en SQL con FILTER + las listas
// públicas de gastos/evidencias + últimos movimientos del ledger.
// Antes este archivo era una copia byte-idéntica de dashboard.ts (solo definía
// GET /admin/dashboard), por lo que este endpoint NO existía y la página
// pública de transparencia recibía 404 (y /admin/dashboard quedaba duplicado).
router.get("/campaigns/:id/transparency", async (req, res) => {
  try {
    const campaignId = Number(req.params.id);
    const [campaign] = await db
      .select()
      .from(campaignsTable)
      .where(eq(campaignsTable.id, campaignId));
    if (!campaign) {
      return res.status(404).json({ error: "not_found", message: "Campaign not found" });
    }

    const [donationStats, expenseStats, evidenceStats, publicExpenses, publicEvidence, recentMovements, leftoverStats, publicLeftovers] =
      await Promise.all([
        db.execute(sql`
          SELECT
            COALESCE(SUM(amount) FILTER (WHERE status = 'approved'), 0)::float8 AS total_raised,
            COUNT(*) FILTER (WHERE status = 'approved')::int AS donor_count
          FROM donations
          WHERE campaign_id = ${campaignId}
        `),
        db.execute(sql`
          SELECT
            COALESCE(SUM(amount), 0)::float8 AS total_spent,
            COALESCE(SUM(amount) FILTER (WHERE is_public), 0)::float8 AS public_spent,
            COUNT(*)::int AS expense_count,
            COUNT(*) FILTER (WHERE is_public)::int AS public_expense_count
          FROM campaign_expenses
          WHERE campaign_id = ${campaignId}
        `),
        db.execute(sql`
          SELECT
            COUNT(*)::int AS evidence_count,
            COUNT(*) FILTER (WHERE is_public)::int AS public_evidence_count
          FROM campaign_evidence
          WHERE campaign_id = ${campaignId}
        `),
        db
          .select()
          .from(campaignExpensesTable)
          .where(
            and(
              eq(campaignExpensesTable.campaignId, campaignId),
              eq(campaignExpensesTable.isPublic, true),
            ),
          )
          .orderBy(desc(campaignExpensesTable.createdAt)),
        db
          .select()
          .from(campaignEvidenceTable)
          .where(
            and(
              eq(campaignEvidenceTable.campaignId, campaignId),
              eq(campaignEvidenceTable.isPublic, true),
            ),
          )
          .orderBy(desc(campaignEvidenceTable.createdAt)),
        db
          .select()
          .from(campaignMovementsTable)
          .where(eq(campaignMovementsTable.campaignId, campaignId))
          .orderBy(desc(campaignMovementsTable.createdAt))
          .limit(10),
        db.execute(sql`
          SELECT
            COUNT(*)::int AS leftover_count,
            COUNT(*) FILTER (WHERE is_public)::int AS public_leftover_count
          FROM campaign_leftovers
          WHERE campaign_id = ${campaignId}
        `),
        db
          .select()
          .from(campaignLeftoversTable)
          .where(
            and(
              eq(campaignLeftoversTable.campaignId, campaignId),
              eq(campaignLeftoversTable.isPublic, true),
            ),
          )
          .orderBy(desc(campaignLeftoversTable.createdAt)),
      ]);

    const [donationRow] = donationStats.rows as [{ total_raised: number; donor_count: number }?];
    const [expenseRow] = expenseStats.rows as [
      { total_spent: number; public_spent: number; expense_count: number; public_expense_count: number }?,
    ];
    const [evidenceRow] = evidenceStats.rows as [{ evidence_count: number; public_evidence_count: number }?];
    const [leftoverRow] = leftoverStats.rows as [
      { leftover_count: number; public_leftover_count: number }?,
    ];

    const totalRaised = Number(donationRow?.total_raised ?? 0);
    const totalSpent = Number(expenseRow?.total_spent ?? 0);
    const publicSpent = Number(expenseRow?.public_spent ?? 0);
    const goal = campaign.goal || 0;

    return res.json({
      campaignId: campaign.id,
      title: campaign.title,
      goal,
      totalRaised,
      totalSpent,
      publicSpent,
      balance: totalRaised - totalSpent,
      donorCount: donationRow?.donor_count ?? 0,
      executionPercent: goal > 0 ? Math.min(100, Math.round((totalSpent / goal) * 100)) : 0,
      raisedPercent: goal > 0 ? Math.min(100, Math.round((totalRaised / goal) * 100)) : 0,
      expenseCount: expenseRow?.expense_count ?? 0,
      publicExpenseCount: expenseRow?.public_expense_count ?? 0,
      evidenceCount: evidenceRow?.evidence_count ?? 0,
      publicEvidenceCount: evidenceRow?.public_evidence_count ?? 0,
      leftoverCount: leftoverRow?.leftover_count ?? 0,
      publicLeftoverCount: leftoverRow?.public_leftover_count ?? 0,
      publicExpenses: publicExpenses.map(formatExpense),
      publicEvidence: publicEvidence.map(formatEvidence),
      publicLeftovers: publicLeftovers.map(formatLeftover),
      recentMovements: recentMovements.map((m) => ({
        type: m.kind,
        description: m.description,
        amount: toSafeAmount(m.amount),
        date: toIsoSafe(m.createdAt),
      })),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get campaign transparency");
    return res.status(500).json({ error: "server_error", message: "Failed to get transparency" });
  }
});

export default router;

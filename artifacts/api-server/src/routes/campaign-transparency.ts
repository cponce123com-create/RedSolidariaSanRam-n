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
import { campaignFunding } from "../lib/funding";
import { toIsoSafe } from "../lib/date-format";
import { formatExpense } from "./campaign-expenses";
import { formatEvidence } from "./campaign-evidence";
import { formatLeftover } from "./campaign-leftovers";

const router = Router();

/**
 * GET /transparency/ledger — registro público global, paginado.
 * Solo incluye donaciones confirmadas y gastos marcados como públicos.
 * No devuelve nombres, correos, teléfonos ni comprobantes de donantes.
 */
router.get("/transparency/ledger", async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 50, 1), 200);
    const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);
    const [countResult, entriesResult] = await Promise.all([
      db.execute(sql`
        SELECT COUNT(*)::int AS total
        FROM (
          SELECT id FROM donations
          WHERE status IN ('approved', 'reconciled')
            AND (collaboration_type <> 'dinero' OR amount > 0)
          UNION ALL
          SELECT id FROM campaign_expenses
          WHERE is_public = true
        ) public_entries
      `),
      db.execute(sql`
        SELECT id, entry_type, campaign_id, campaign_title, created_at,
               amount, description
        FROM (
          SELECT
            d.id,
            'income'::text AS entry_type,
            d.campaign_id,
            COALESCE(c.title, 'Fondo general') AS campaign_title,
            d.created_at,
            d.amount::float8 AS amount,
            CASE WHEN d.collaboration_type = 'dinero' THEN 'Donación recibida' ELSE 'Aporte no monetario recibido' END AS description
          FROM donations d
          LEFT JOIN campaigns c ON c.id = d.campaign_id
          WHERE d.status IN ('approved', 'reconciled')
            AND (d.collaboration_type <> 'dinero' OR d.amount > 0)
          UNION ALL
          SELECT
            e.id,
            'expense'::text AS entry_type,
            e.campaign_id,
            COALESCE(c.title, 'Fondo general') AS campaign_title,
            e.created_at,
            e.amount::float8 AS amount,
            e.description
          FROM campaign_expenses e
          LEFT JOIN campaigns c ON c.id = e.campaign_id
          WHERE e.is_public = true
        ) public_entries
        ORDER BY created_at DESC, entry_type ASC, id DESC
        LIMIT ${limit} OFFSET ${offset}
      `),
    ]);
    const [countRow] = countResult.rows as [{ total: number }?];
    const rows = entriesResult.rows as Record<string, unknown>[];
    res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
    return res.json({
      total: Number(countRow?.total ?? 0),
      limit,
      offset,
      entries: rows.map((row) => ({
        id: Number(row.id),
        type: row.entry_type,
        campaignId: row.campaign_id == null ? null : Number(row.campaign_id),
        campaignTitle: String(row.campaign_title ?? "Fondo general"),
        date: toIsoSafe(row.created_at as Date | string | null),
        amount: Number(row.amount ?? 0),
        description: String(row.description ?? ""),
      })),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get public transparency ledger");
    return res.status(500).json({ error: "server_error", message: "No se pudo cargar el registro público" });
  }
});


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
            COALESCE(SUM(amount) FILTER (WHERE status IN ('approved','reconciled')), 0)::float8 AS total_raised,
            -- Una donación en especie (valor 0) no es un aporte de dinero.
            COUNT(*) FILTER (WHERE status IN ('approved','reconciled') AND amount > 0)::int AS donor_count
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

    // Recaudación conciliada (Fase 3.1): el panel público y la ficha de la
    // campaña deben publicar la MISMA cifra. Antes aquí solo se sumaban las
    // donaciones, así que una campaña con recaudación histórica mostraba 0.
    const funding = campaignFunding(campaign.raised, donationRow?.total_raised);
    const totalRaised = funding.reconciledRaised;
    const isAdmin = Boolean(req.session?.adminUser);
    const totalSpent = Number(expenseRow?.total_spent ?? 0);
    const publicSpent = Number(expenseRow?.public_spent ?? 0);
    const reportedSpent = isAdmin ? totalSpent : publicSpent;
    if (isAdmin) res.setHeader("Cache-Control", "private, no-store");
    else res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
    const goal = campaign.goal || 0;

    return res.json({
      campaignId: campaign.id,
      title: campaign.title,
      goal,
      totalRaised,
      verifiedRaised: funding.verifiedRaised,
      historicalRaised: funding.historicalRaised,
      historicalCounted: funding.historicalCounted,
      totalSpent: reportedSpent,
      publicSpent,
      balance: totalRaised - reportedSpent,
      // Fecha de la consulta: los datos se leen en vivo de la base, así que el
      // panel puede mostrar cuándo se actualizó por última vez (Fase 3.2).
      updatedAt: new Date().toISOString(),
      donorCount: donationRow?.donor_count ?? 0,
      executionPercent: goal > 0 ? Math.min(100, Math.round((reportedSpent / goal) * 100)) : 0,
      raisedPercent: goal > 0 ? Math.min(100, Math.round((totalRaised / goal) * 100)) : 0,
      expenseCount: isAdmin ? (expenseRow?.expense_count ?? 0) : (expenseRow?.public_expense_count ?? 0),
      publicExpenseCount: expenseRow?.public_expense_count ?? 0,
      evidenceCount: isAdmin ? (evidenceRow?.evidence_count ?? 0) : (evidenceRow?.public_evidence_count ?? 0),
      publicEvidenceCount: evidenceRow?.public_evidence_count ?? 0,
      leftoverCount: isAdmin ? (leftoverRow?.leftover_count ?? 0) : (leftoverRow?.public_leftover_count ?? 0),
      publicLeftoverCount: leftoverRow?.public_leftover_count ?? 0,
      publicExpenses: publicExpenses.map(formatExpense),
      publicEvidence: publicEvidence.map(formatEvidence),
      publicLeftovers: publicLeftovers.map(formatLeftover),
      recentMovements: recentMovements.map((m) => ({
        type: m.kind,
        description: m.sourceType === "donation" ? "Donación recibida" : m.description,
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

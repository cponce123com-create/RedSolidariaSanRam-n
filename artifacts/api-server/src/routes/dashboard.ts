import { Router } from "express";
import { db } from "@workspace/db";
import {
  campaignsTable, donationsTable, campaignExpensesTable,
  communityReportsTable, adoptionRequestsTable, volunteersTable,
  contactMessagesTable, newsTable, petsTable
} from "@workspace/db";
import { eq, gte, sql, desc, count, sum } from "drizzle-orm";
import { toSafeAmount } from "../lib/amount-format";
import { campaignFunding, roundMoney } from "../lib/funding";
import {
  describeDashboardFilters,
  parseDashboardFilters,
} from "../lib/dashboard-filters";

const router = Router();

router.get("/admin/dashboard", async (req, res) => {
  // Fase 6 (V7-5): filtros por campaña, estado y rango de fechas. TODAS las
  // cifras de campaña salen de la MISMA consulta filtrada: nunca de mezclas
  // hechas a mano en la interfaz.
  const parsed = parseDashboardFilters(req.query);
  if ("error" in parsed) {
    return res.status(400).json({ error: "validation_error", message: parsed.error });
  }
  const filters = parsed.filters;

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sixMonthsAgo = new Date(now.getTime() - 6 * 30 * 24 * 60 * 60 * 1000);

  // ─── Fragmentos condicionales ───────────────────────────────────────────────
  // Drizzle interpola vacío cuando el filtro no aplica. Al filtrar por estado se
  // une con `campaigns` porque el fondo general (donación sin campaña) no tiene
  // estado: si se pide «campañas activas», el fondo general no pertenece ahí.
  const donationJoin = filters.status
    ? sql` JOIN campaigns c ON c.id = d.campaign_id`
    : sql``;
  const donationCampaignWhere =
    filters.campaignId != null ? sql` AND d.campaign_id = ${filters.campaignId}` : sql``;
  const donationDateWhere = sql`${
    filters.from ? sql` AND d.created_at >= ${filters.from}` : sql``
  }${filters.to ? sql` AND d.created_at <= ${filters.to}` : sql``}`;
  const expenseJoin = filters.status
    ? sql` JOIN campaigns c ON c.id = e.campaign_id`
    : sql``;
  const expenseCampaignWhere =
    filters.campaignId != null ? sql` AND e.campaign_id = ${filters.campaignId}` : sql``;
  // `campaign_expenses.date` es texto ISO (YYYY-MM-DD): la comparación
  // lexicográfica equivale a la cronológica.
  const expenseDateWhere = sql`${
    filters.from ? sql` AND e.date >= ${filters.from.slice(0, 10)}` : sql``
  }${filters.to ? sql` AND e.date <= ${filters.to.slice(0, 10)}` : sql``}`;

  const [
    campaignStats,
    donationStats,
    expenseStats,
    petStats,
    pendingReports,
    pendingAdoptions,
    recentVolunteers,
    recentMessages,
    recentDonations,
    monthlyDonations,
    topCampaigns,
    expensesByCategory,
    pendingVolunteers,
    recentNews,
  ] = await Promise.all([
    // Agregaciones en SQL (no full-table-scans en Node): COUNT/SUM con FILTER
    // evitan traer todo el histórico de donaciones/gastos a memoria.
    db.execute(sql`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status = 'active')::int AS active,
        COUNT(*) FILTER (WHERE status IN ('completed', 'inactive'))::int AS completed
      FROM campaigns
      WHERE 1 = 1
        ${filters.status ? sql`AND status = ${filters.status}` : sql``}
        ${filters.campaignId != null ? sql`AND id = ${filters.campaignId}` : sql``}
    `),
    // Recaudación conciliada (Fase 3.1) respetando los filtros: el verificado es
    // la suma de donaciones confirmadas en el ámbito pedido; el histórico solo
    // cuenta para campañas sin donaciones registradas, así no se duplica.
    db.execute(sql`
      SELECT
        COALESCE((
          SELECT SUM(d.amount) FROM donations d
          ${donationJoin}
          WHERE d.status IN ('approved','reconciled')
            ${donationCampaignWhere}
            ${donationDateWhere}
        ), 0)::float8 AS verified,
        COALESCE((
          SELECT SUM(c.raised) FROM campaigns c
          WHERE c.raised > 0
            ${filters.status ? sql`AND c.status = ${filters.status}` : sql``}
            ${filters.campaignId != null ? sql`AND c.id = ${filters.campaignId}` : sql``}
            AND NOT EXISTS (
              SELECT 1 FROM donations d
              WHERE d.campaign_id = c.id AND d.status IN ('approved','reconciled')
            )
        ), 0)::float8 AS historical
    `),
    db.execute(sql`
      SELECT COALESCE(SUM(e.amount), 0)::float8 AS total_spent
      FROM campaign_expenses e
      ${expenseJoin}
      WHERE 1 = 1
        ${expenseCampaignWhere}
        ${expenseDateWhere}
    `),
    // Los indicadores que no dependen de campaña (mascotas, reportes,
    // adopciones, voluntarios) se muestran SIEMPRE globales y el panel los
    // marca como tales: no se pueden atribuir a una campaña ni a un rango.
    db.execute(sql`SELECT COUNT(*) FILTER (WHERE status = 'available')::int AS available FROM pets`),
    db.select({ count: count() }).from(communityReportsTable).where(eq(communityReportsTable.status, "pending")),
    db.select({ count: count() }).from(adoptionRequestsTable).where(eq(adoptionRequestsTable.status, "pending")),
    db.select().from(volunteersTable).where(gte(volunteersTable.createdAt, thirtyDaysAgo)).orderBy(desc(volunteersTable.createdAt)).limit(5),
    db.select().from(contactMessagesTable).orderBy(desc(contactMessagesTable.createdAt)).limit(5),
    db.select().from(donationsTable).orderBy(desc(donationsTable.createdAt)).limit(8),
    db.execute(sql`
      SELECT
        TO_CHAR(d.created_at, 'YYYY-MM') AS month,
        SUM(d.amount)::float8 AS total,
        COUNT(*)::int AS count
      FROM donations d
      ${donationJoin}
      WHERE d.created_at >= ${sixMonthsAgo.toISOString()}
        AND d.status IN ('approved','reconciled')
        ${donationCampaignWhere}
        ${donationDateWhere}
      GROUP BY TO_CHAR(d.created_at, 'YYYY-MM')
      ORDER BY month ASC
    `),
    // Top de campañas con la MISMA regla de conciliación que el sitio público
    // (Fase 3.1). Antes ordenaba por la columna manual `raised`, así que el
    // panel podía destacar campañas con cifras distintas de las publicadas.
    db.execute(sql`
      SELECT title, goal, status, historical, verified
      FROM (
        SELECT
          c.title,
          COALESCE(c.raised, 0)::float8 AS historical,
          c.goal,
          c.status,
          COALESCE(SUM(d.amount) FILTER (WHERE d.status IN ('approved','reconciled')${
            filters.from ? sql` AND d.created_at >= ${filters.from}` : sql``
          }${filters.to ? sql` AND d.created_at <= ${filters.to}` : sql``}), 0)::float8 AS verified
        FROM campaigns c
        LEFT JOIN donations d ON d.campaign_id = c.id
        WHERE 1 = 1
          ${filters.status ? sql`AND c.status = ${filters.status}` : sql``}
          ${filters.campaignId != null ? sql`AND c.id = ${filters.campaignId}` : sql``}
        GROUP BY c.id
      ) t
      ORDER BY (CASE WHEN t.verified > 0 THEN t.verified ELSE t.historical END) DESC
      LIMIT 5
    `),
    db.execute(sql`
      SELECT e.category, SUM(e.amount)::float8 AS total, COUNT(*)::int AS count
      FROM campaign_expenses e
      ${expenseJoin}
      WHERE 1 = 1
        ${expenseCampaignWhere}
        ${expenseDateWhere}
      GROUP BY e.category
      ORDER BY total DESC
    `),
    db.select({ count: count() }).from(volunteersTable).where(eq(volunteersTable.status, "pending")),
    db.select().from(newsTable).orderBy(desc(newsTable.createdAt)).limit(5),
  ]);

  // SUM sobre numeric devuelve string desde pg; Number() normaliza.
  const [campaignRow] = campaignStats.rows as [{ total: number; active: number; completed: number }?];
  const [donationRow] = donationStats.rows as [{ verified: number; historical: number }?];
  const [expenseRow] = expenseStats.rows as [{ total_spent: number }?];
  const [petRow] = petStats.rows as [{ available: number }?];
  // Misma regla de conciliación que el sitio público (Fase 3.1): suma de
  // donaciones confirmadas + histórico SOLO de las campañas sin donaciones
  // registradas. Nunca el máximo de dos cifras solapadas.
  // Con un rango de fechas activo el importe histórico NO se cuenta: es un
  // acumulado que no se puede atribuir a un periodo, así que sumarlo mostraría
  // dinero de fuera del rango. Se publica solo la recaudación verificada.
  const funding = campaignFunding(
    filters.hasDateRange ? 0 : donationRow?.historical,
    donationRow?.verified,
  );
  // Redondeo a céntimos: los importes son `numeric(12,2)` y sumarlos en coma
  // flotante deriva (p. ej. −1714.3000000000002). El panel debe publicar la misma
  // cifra que la conciliación, con dos decimales.
  const totalSpent = roundMoney(expenseRow?.total_spent ?? 0);

  return res.json({
    // Trazabilidad: se devuelve QUÉ filtros produjeron estas cifras.
    filters: {
      ...filters,
      description: describeDashboardFilters(filters),
    },
    summary: {
      totalCampaigns: campaignRow?.total ?? 0,
      activeCampaigns: campaignRow?.active ?? 0,
      completedCampaigns: campaignRow?.completed ?? 0,
      // `totalRaised` se conserva por compatibilidad y equivale al conciliado.
      totalRaised: funding.reconciledRaised,
      verifiedRaised: funding.verifiedRaised,
      historicalRaised: funding.historicalRaised,
      historicalCounted: funding.historicalCounted,
      totalSpent,
      balance: roundMoney(funding.reconciledRaised - totalSpent),
      pendingReports: pendingReports[0]?.count ?? 0,
      pendingAdoptions: pendingAdoptions[0]?.count ?? 0,
      pendingVolunteers: pendingVolunteers[0]?.count ?? 0,
      newVolunteersThisMonth: recentVolunteers.length,
      availablePets: petRow?.available ?? 0,
    },
    charts: {
      monthlyDonations: monthlyDonations.rows.map((r: any) => ({
        month: r.month,
        total: Number(r.total),
        count: Number(r.count),
      })),
      topCampaigns: (
        topCampaigns.rows as {
          title: string;
          goal: number | string;
          status: string;
          historical: number | string;
          verified: number | string;
        }[]
      ).map((c) => {
        // Misma regla de conciliación que el sitio público (Fase 3.1).
        const funding = campaignFunding(c.historical, c.verified);
        return {
          title: c.title.length > 30 ? c.title.slice(0, 30) + "…" : c.title,
          raised: funding.reconciledRaised,
          goal: toSafeAmount(c.goal),
          status: c.status,
        };
      }),
      expensesByCategory: expensesByCategory.rows.map((r: any) => ({
        category: r.category,
        total: Number(r.total),
        count: Number(r.count),
      })),
    },
    recent: {
      donations: recentDonations.map(d => ({
        id: d.id,
        name: d.anonymous ? "Anónimo" : `${d.firstName} ${d.lastName}`,
        amount: toSafeAmount(d.amount),
        method: d.paymentMethod,
        status: d.status,
        createdAt: d.createdAt,
      })),
      volunteers: recentVolunteers.map(v => ({
        id: v.id,
        name: v.name,
        availability: v.availability,
        status: v.status,
        createdAt: v.createdAt,
      })),
      messages: recentMessages.map(m => ({
        id: m.id,
        name: m.name,
        subject: m.subject,
        createdAt: m.createdAt,
      })),
      news: recentNews.map(n => ({
        id: n.id,
        title: n.title,
        createdAt: n.createdAt,
      })),
    },
  });
});

export default router;

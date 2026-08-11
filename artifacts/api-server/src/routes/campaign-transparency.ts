import { Router } from "express";
import { db } from "@workspace/db";
import {
  campaignsTable, donationsTable, campaignExpensesTable,
  communityReportsTable, adoptionRequestsTable, volunteersTable,
  contactMessagesTable, newsTable, petsTable
} from "@workspace/db";
import { eq, gte, sql, desc, count, sum } from "drizzle-orm";
import { toSafeAmount } from "../lib/amount-format";

const router = Router();

router.get("/admin/dashboard", async (req, res) => {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sixMonthsAgo = new Date(now.getTime() - 6 * 30 * 24 * 60 * 60 * 1000);

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
    `),
    db.execute(sql`
      SELECT COALESCE(SUM(amount), 0)::float8 AS total_raised
      FROM donations
      WHERE status = 'approved'
    `),
    db.execute(sql`SELECT COALESCE(SUM(amount), 0)::float8 AS total_spent FROM campaign_expenses`),
    db.execute(sql`SELECT COUNT(*) FILTER (WHERE status = 'available')::int AS available FROM pets`),
    db.select({ count: count() }).from(communityReportsTable).where(eq(communityReportsTable.status, "pending")),
    db.select({ count: count() }).from(adoptionRequestsTable).where(eq(adoptionRequestsTable.status, "pending")),
    db.select().from(volunteersTable).where(gte(volunteersTable.createdAt, thirtyDaysAgo)).orderBy(desc(volunteersTable.createdAt)).limit(5),
    db.select().from(contactMessagesTable).orderBy(desc(contactMessagesTable.createdAt)).limit(5),
    db.select().from(donationsTable).orderBy(desc(donationsTable.createdAt)).limit(8),
    db.execute(sql`
      SELECT
        TO_CHAR(created_at, 'YYYY-MM') AS month,
        SUM(amount)::float8 AS total,
        COUNT(*)::int AS count
      FROM donations
      WHERE created_at >= ${sixMonthsAgo.toISOString()}
      GROUP BY TO_CHAR(created_at, 'YYYY-MM')
      ORDER BY month ASC
    `),
    db.select().from(campaignsTable).orderBy(desc(campaignsTable.raised)).limit(5),
    db.execute(sql`
      SELECT category, SUM(amount)::float8 AS total, COUNT(*)::int AS count
      FROM campaign_expenses
      GROUP BY category
      ORDER BY total DESC
    `),
    db.select({ count: count() }).from(volunteersTable).where(eq(volunteersTable.status, "pending")),
    db.select().from(newsTable).orderBy(desc(newsTable.createdAt)).limit(5),
  ]);

  // SUM sobre numeric devuelve string desde pg; Number() normaliza.
  const [campaignRow] = campaignStats.rows as [{ total: number; active: number; completed: number }?];
  const [donationRow] = donationStats.rows as [{ total_raised: number }?];
  const [expenseRow] = expenseStats.rows as [{ total_spent: number }?];
  const [petRow] = petStats.rows as [{ available: number }?];
  const totalRaised = Number(donationRow?.total_raised ?? 0);
  const totalSpent = Number(expenseRow?.total_spent ?? 0);

  return res.json({
    summary: {
      totalCampaigns: campaignRow?.total ?? 0,
      activeCampaigns: campaignRow?.active ?? 0,
      completedCampaigns: campaignRow?.completed ?? 0,
      totalRaised,
      totalSpent,
      balance: totalRaised - totalSpent,
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
      topCampaigns: topCampaigns.map(c => ({
        title: c.title.length > 30 ? c.title.slice(0, 30) + "…" : c.title,
        raised: c.raised,
        goal: c.goal,
        status: c.status,
      })),
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

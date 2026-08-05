import { Router } from "express";
import { db } from "@workspace/db";
import {
  campaignsTable, donationsTable, campaignExpensesTable,
  communityReportsTable, adoptionRequestsTable, volunteersTable,
  contactMessagesTable, newsTable, petsTable
} from "@workspace/db";
import { eq, gte, sql, desc, count, sum } from "drizzle-orm";

const router = Router();

router.get("/admin/dashboard", async (req, res) => {
  if (!(req.session as any).adminUser) return res.status(401).json({ error: "unauthorized" });

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sixMonthsAgo = new Date(now.getTime() - 6 * 30 * 24 * 60 * 60 * 1000);

  const [
    allCampaigns,
    allDonations,
    allExpenses,
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
    allPets,
  ] = await Promise.all([
    db.select().from(campaignsTable),
    db.select().from(donationsTable),
    db.select().from(campaignExpensesTable),
    db.select({ count: count() }).from(communityReportsTable).where(eq(communityReportsTable.status, "pending")),
    db.select({ count: count() }).from(adoptionRequestsTable).where(eq(adoptionRequestsTable.status, "pending")),
    db.select().from(volunteersTable).where(gte(volunteersTable.createdAt, thirtyDaysAgo)).orderBy(desc(volunteersTable.createdAt)).limit(5),
    db.select().from(contactMessagesTable).orderBy(desc(contactMessagesTable.createdAt)).limit(5),
    db.select().from(donationsTable).orderBy(desc(donationsTable.createdAt)).limit(8),
    db.execute(sql`
      SELECT
        TO_CHAR(created_at, 'YYYY-MM') AS month,
        SUM(amount) AS total,
        COUNT(*) AS count
      FROM donations
      WHERE created_at >= ${sixMonthsAgo.toISOString()}
      GROUP BY TO_CHAR(created_at, 'YYYY-MM')
      ORDER BY month ASC
    `),
    db.select().from(campaignsTable).orderBy(desc(campaignsTable.raised)).limit(5),
    db.execute(sql`
      SELECT category, SUM(amount) AS total, COUNT(*) AS count
      FROM campaign_expenses
      GROUP BY category
      ORDER BY total DESC
    `),
    db.select({ count: count() }).from(volunteersTable).where(eq(volunteersTable.status, "pending")),
    db.select().from(newsTable).orderBy(desc(newsTable.createdAt)).limit(5),
    db.select().from(petsTable),
  ]);

  const activeCampaigns = allCampaigns.filter(c => c.status === "active").length;
  const completedCampaigns = allCampaigns.filter(c => c.status === "completed" || c.status === "inactive").length;
  const totalRaised = allDonations.filter(d => d.status === "approved").reduce((acc, d) => acc + d.amount, 0);
  const totalSpent = allExpenses.reduce((acc, e) => acc + e.amount, 0);
  const availablePets = allPets.filter(p => p.status === "available").length;

  return res.json({
    summary: {
      totalCampaigns: allCampaigns.length,
      activeCampaigns,
      completedCampaigns,
      totalRaised,
      totalSpent,
      balance: totalRaised - totalSpent,
      pendingReports: pendingReports[0]?.count ?? 0,
      pendingAdoptions: pendingAdoptions[0]?.count ?? 0,
      pendingVolunteers: pendingVolunteers[0]?.count ?? 0,
      newVolunteersThisMonth: recentVolunteers.length,
      availablePets,
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
        amount: d.amount,
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

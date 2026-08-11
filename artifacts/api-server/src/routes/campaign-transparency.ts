import { Router, type IRouter } from "express";
import { db, campaignsTable, donationsTable, campaignExpensesTable, campaignEvidenceTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { toIsoSafe } from "../lib/date-format";

const router: IRouter = Router();

router.get("/campaigns/:id/transparency", async (req, res) => {
  try {
    const campaignId = parseInt(req.params.id);

    const [campaign] = await db.select().from(campaignsTable).where(eq(campaignsTable.id, campaignId));
    if (!campaign) return res.status(404).json({ error: "not_found", message: "Campaign not found" });

    const donations = await db.select().from(donationsTable).where(eq(donationsTable.campaignId, campaignId));
    const approvedDonations = donations.filter((d) => d.status === "approved");
    const donationsRaised = approvedDonations.reduce((sum, d) => sum + d.amount, 0);
    const totalRaised = Math.max(campaign.raised, donationsRaised);
    const donorCount = approvedDonations.length;

    const allExpenses = await db.select().from(campaignExpensesTable).where(eq(campaignExpensesTable.campaignId, campaignId));
    const publicExpenses = allExpenses.filter((e) => e.isPublic);
    const totalSpent = allExpenses.reduce((sum, e) => sum + e.amount, 0);
    const publicSpent = publicExpenses.reduce((sum, e) => sum + e.amount, 0);

    const balance = totalRaised - totalSpent;
    const goal = campaign.goal;
    const executionPercent = totalRaised > 0 ? Math.min(100, Math.round((totalSpent / totalRaised) * 100)) : 0;
    const raisedPercent = goal > 0 ? Math.min(100, Math.round((totalRaised / goal) * 100)) : 0;

    const evidence = await db.select().from(campaignEvidenceTable).where(eq(campaignEvidenceTable.campaignId, campaignId));
    const publicEvidence = evidence.filter((e) => e.isPublic);

    const recentMovements = [
      ...approvedDonations.slice(-5).map((d) => ({
        type: "ingreso" as const,
        description: d.anonymous ? "Donación anónima" : `Donación de ${d.firstName} ${d.lastName}`,
        amount: d.amount,
        date: toIsoSafe(d.createdAt),
      })),
      ...publicExpenses.slice(-5).map((e) => ({
        type: "gasto" as const,
        description: e.description,
        amount: e.amount,
        date: toIsoSafe(e.createdAt),
      })),
    ]
      .sort((a, b) => new Date(b.date ?? 0).getTime() - new Date(a.date ?? 0).getTime())
      .slice(0, 8);

    return res.json({
      campaignId,
      title: campaign.title,
      goal,
      totalRaised,
      totalSpent,
      publicSpent,
      balance,
      donorCount,
      executionPercent,
      raisedPercent,
      expenseCount: allExpenses.length,
      publicExpenseCount: publicExpenses.length,
      evidenceCount: evidence.length,
      publicEvidenceCount: publicEvidence.length,
      publicExpenses: publicExpenses
        .map((e) => ({
          id: e.id,
          description: e.description,
          category: e.category,
          amount: e.amount,
          date: e.date,
          responsible: e.responsible,
          receiptUrl: e.receiptUrl,
          receiptType: e.receiptType,
        }))
        .reverse(),
      publicEvidence: publicEvidence
        .map((e) => ({
          id: e.id,
          title: e.title,
          description: e.description,
          mediaUrl: e.mediaUrl,
          mediaType: e.mediaType,
          evidenceType: e.evidenceType,
          date: e.date,
        }))
        .reverse(),
      recentMovements,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get transparency data");
    return res.status(500).json({ error: "server_error", message: "Failed to get transparency data" });
  }
});

export default router;

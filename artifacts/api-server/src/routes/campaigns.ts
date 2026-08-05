import { Router, type IRouter } from "express";
import { db, campaignsTable, donationsTable, insertCampaignSchema } from "@workspace/db";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

router.get("/campaigns", async (req, res) => {
  try {
    const { status, featured } = req.query;
    const campaigns = await db.select().from(campaignsTable);
    let filtered = campaigns;
    if (status && status !== "all") {
      filtered = filtered.filter((c) => c.status === status);
    }
    if (featured !== undefined) {
      const featuredBool = featured === "true";
      filtered = filtered.filter((c) => c.featured === featuredBool);
    }
    const result = await Promise.all(filtered.map(formatCampaignWithDonors));
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Failed to get campaigns");
    res.status(500).json({ error: "server_error", message: "Failed to get campaigns" });
  }
});

router.get("/campaigns/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [campaign] = await db.select().from(campaignsTable).where(eq(campaignsTable.id, id));
    if (!campaign) {
      return res.status(404).json({ error: "not_found", message: "Campaign not found" });
    }
    return res.json(await formatCampaignWithDonors(campaign));
  } catch (err) {
    req.log.error({ err }, "Failed to get campaign");
    return res.status(500).json({ error: "server_error", message: "Failed to get campaign" });
  }
});

router.post("/campaigns", async (req, res) => {
  try {
    const data = insertCampaignSchema.parse(req.body);
    const [campaign] = await db.insert(campaignsTable).values(data).returning();
    res.status(201).json(await formatCampaignWithDonors(campaign));
  } catch (err) {
    req.log.error({ err }, "Failed to create campaign");
    res.status(400).json({ error: "validation_error", message: "Invalid campaign data" });
  }
});

router.put("/campaigns/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const data = insertCampaignSchema.parse(req.body);
    const [campaign] = await db.update(campaignsTable).set(data).where(eq(campaignsTable.id, id)).returning();
    if (!campaign) {
      return res.status(404).json({ error: "not_found", message: "Campaign not found" });
    }
    return res.json(await formatCampaignWithDonors(campaign));
  } catch (err) {
    req.log.error({ err }, "Failed to update campaign");
    return res.status(400).json({ error: "validation_error", message: "Invalid campaign data" });
  }
});

router.delete("/campaigns/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(campaignsTable).where(eq(campaignsTable.id, id));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete campaign");
    res.status(500).json({ error: "server_error", message: "Failed to delete campaign" });
  }
});

async function formatCampaignWithDonors(c: typeof campaignsTable.$inferSelect) {
  const donations = await db
    .select()
    .from(donationsTable)
    .where(eq(donationsTable.campaignId, c.id));
  const approvedDonations = donations.filter((d) => d.status === "approved");
  const donorCount = approvedDonations.length;
  const raisedFromDonations = approvedDonations.reduce((sum, d) => sum + d.amount, 0);
  const raised = Math.max(c.raised, raisedFromDonations);

  return {
    id: c.id,
    title: c.title,
    description: c.description,
    imageUrl: c.imageUrl,
    goal: c.goal,
    raised,
    donorCount,
    status: c.status,
    featured: c.featured,
    category: c.category,
    startDate: c.startDate,
    endDate: c.endDate,
    createdAt: c.createdAt.toISOString(),
  };
}

export default router;

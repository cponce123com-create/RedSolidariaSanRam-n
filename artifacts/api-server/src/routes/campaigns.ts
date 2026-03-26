import { Router, type IRouter } from "express";
import { db, campaignsTable, insertCampaignSchema } from "@workspace/db";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

router.get("/campaigns", async (req, res) => {
  try {
    const { status, featured } = req.query;
    let query = db.select().from(campaignsTable);
    const campaigns = await query;
    let filtered = campaigns;
    if (status && status !== "all") {
      filtered = filtered.filter((c) => c.status === status);
    }
    if (featured !== undefined) {
      const featuredBool = featured === "true";
      filtered = filtered.filter((c) => c.featured === featuredBool);
    }
    res.json(filtered.map(formatCampaign));
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
    res.json(formatCampaign(campaign));
  } catch (err) {
    req.log.error({ err }, "Failed to get campaign");
    res.status(500).json({ error: "server_error", message: "Failed to get campaign" });
  }
});

router.post("/campaigns", async (req, res) => {
  try {
    const data = insertCampaignSchema.parse(req.body);
    const [campaign] = await db.insert(campaignsTable).values(data).returning();
    res.status(201).json(formatCampaign(campaign));
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
    res.json(formatCampaign(campaign));
  } catch (err) {
    req.log.error({ err }, "Failed to update campaign");
    res.status(400).json({ error: "validation_error", message: "Invalid campaign data" });
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

function formatCampaign(c: typeof campaignsTable.$inferSelect) {
  return {
    id: c.id,
    title: c.title,
    description: c.description,
    imageUrl: c.imageUrl,
    goal: c.goal,
    raised: c.raised,
    status: c.status,
    featured: c.featured,
    category: c.category,
    startDate: c.startDate,
    endDate: c.endDate,
    createdAt: c.createdAt.toISOString(),
  };
}

export default router;

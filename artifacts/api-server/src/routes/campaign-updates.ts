import { Router, type IRouter } from "express";
import { db, campaignUpdatesTable, insertCampaignUpdateSchema } from "@workspace/db";
import { eq, and } from "drizzle-orm";

const router: IRouter = Router();

router.get("/campaigns/:id/updates", async (req, res) => {
  try {
    const campaignId = parseInt(req.params.id);
    const updates = await db
      .select()
      .from(campaignUpdatesTable)
      .where(eq(campaignUpdatesTable.campaignId, campaignId));
    res.json(updates.map(formatUpdate).reverse());
  } catch (err) {
    req.log.error({ err }, "Failed to get campaign updates");
    res.status(500).json({ error: "server_error", message: "Failed to get updates" });
  }
});

router.post("/campaigns/:id/updates", async (req, res) => {
  try {
    const campaignId = parseInt(req.params.id);
    const data = insertCampaignUpdateSchema.parse({ ...req.body, campaignId });
    const [update] = await db.insert(campaignUpdatesTable).values(data).returning();
    res.status(201).json(formatUpdate(update));
  } catch (err) {
    req.log.error({ err }, "Failed to create campaign update");
    res.status(400).json({ error: "validation_error", message: "Invalid update data" });
  }
});

router.delete("/campaigns/:id/updates/:updateId", async (req, res) => {
  try {
    const campaignId = parseInt(req.params.id);
    const updateId = parseInt(req.params.updateId);
    await db
      .delete(campaignUpdatesTable)
      .where(and(eq(campaignUpdatesTable.id, updateId), eq(campaignUpdatesTable.campaignId, campaignId)));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete campaign update");
    res.status(500).json({ error: "server_error", message: "Failed to delete update" });
  }
});

function formatUpdate(u: typeof campaignUpdatesTable.$inferSelect) {
  return {
    id: u.id,
    campaignId: u.campaignId,
    title: u.title,
    content: u.content,
    createdAt: u.createdAt.toISOString(),
  };
}

export default router;

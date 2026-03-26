import { Router, type IRouter } from "express";
import { db, campaignImagesTable, insertCampaignImageSchema } from "@workspace/db";
import { eq, and } from "drizzle-orm";

const router: IRouter = Router();

router.get("/campaigns/:id/images", async (req, res) => {
  try {
    const campaignId = parseInt(req.params.id);
    const images = await db
      .select()
      .from(campaignImagesTable)
      .where(eq(campaignImagesTable.campaignId, campaignId));
    res.json(images.map(formatImage));
  } catch (err) {
    req.log.error({ err }, "Failed to get campaign images");
    res.status(500).json({ error: "server_error", message: "Failed to get images" });
  }
});

router.post("/campaigns/:id/images", async (req, res) => {
  try {
    const campaignId = parseInt(req.params.id);
    const data = insertCampaignImageSchema.parse({ ...req.body, campaignId });
    const [image] = await db.insert(campaignImagesTable).values(data).returning();
    res.status(201).json(formatImage(image));
  } catch (err) {
    req.log.error({ err }, "Failed to add campaign image");
    res.status(400).json({ error: "validation_error", message: "Invalid image data" });
  }
});

router.delete("/campaigns/:id/images/:imageId", async (req, res) => {
  try {
    const campaignId = parseInt(req.params.id);
    const imageId = parseInt(req.params.imageId);
    await db
      .delete(campaignImagesTable)
      .where(and(eq(campaignImagesTable.id, imageId), eq(campaignImagesTable.campaignId, campaignId)));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete campaign image");
    res.status(500).json({ error: "server_error", message: "Failed to delete image" });
  }
});

function formatImage(i: typeof campaignImagesTable.$inferSelect) {
  return {
    id: i.id,
    campaignId: i.campaignId,
    imageUrl: i.imageUrl,
    caption: i.caption,
    createdAt: i.createdAt.toISOString(),
  };
}

export default router;

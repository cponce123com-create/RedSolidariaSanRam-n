import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const campaignImagesTable = pgTable("campaign_images", {
  id: serial("id").primaryKey(),
  campaignId: integer("campaign_id").notNull(),
  imageUrl: text("image_url").notNull(),
  caption: text("caption"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertCampaignImageSchema = createInsertSchema(campaignImagesTable).omit({ id: true, createdAt: true });
export type InsertCampaignImage = z.infer<typeof insertCampaignImageSchema>;
export type CampaignImage = typeof campaignImagesTable.$inferSelect;

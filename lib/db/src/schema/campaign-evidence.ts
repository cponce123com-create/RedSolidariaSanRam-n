import { pgTable, text, serial, boolean, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const campaignEvidenceTable = pgTable("campaign_evidence", {
  id: serial("id").primaryKey(),
  campaignId: integer("campaign_id").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  mediaUrl: text("media_url").notNull(),
  mediaType: text("media_type").notNull().default("image"),
  evidenceType: text("evidence_type").notNull().default("activity"),
  date: text("date").notNull(),
  isPublic: boolean("is_public").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertCampaignEvidenceSchema = createInsertSchema(campaignEvidenceTable).omit({ id: true, createdAt: true });
export type InsertCampaignEvidence = z.infer<typeof insertCampaignEvidenceSchema>;
export type CampaignEvidence = typeof campaignEvidenceTable.$inferSelect;

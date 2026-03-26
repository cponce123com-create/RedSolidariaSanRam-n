import { pgTable, text, serial, boolean, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const communityReportsTable = pgTable("community_reports", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  location: text("location").notNull(),
  urgency: text("urgency").notNull().default("medium"),
  photos: text("photos").array(),
  reporterName: text("reporter_name").notNull(),
  reporterPhone: text("reporter_phone"),
  reporterEmail: text("reporter_email"),
  isAnonymous: boolean("is_anonymous").notNull().default(false),
  status: text("status").notNull().default("pending"),
  adminNotes: text("admin_notes"),
  campaignId: integer("campaign_id"),
  featuredOnHome: boolean("featured_on_home").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertCommunityReportSchema = createInsertSchema(communityReportsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  status: true,
  adminNotes: true,
  campaignId: true,
  featuredOnHome: true,
});

export const updateCommunityReportSchema = z.object({
  status: z.enum(["pending", "reviewing", "approved", "rejected", "converted", "archived"]).optional(),
  adminNotes: z.string().optional(),
  featuredOnHome: z.boolean().optional(),
  campaignId: z.number().optional(),
});

export type InsertCommunityReport = z.infer<typeof insertCommunityReportSchema>;
export type UpdateCommunityReport = z.infer<typeof updateCommunityReportSchema>;
export type CommunityReport = typeof communityReportsTable.$inferSelect;

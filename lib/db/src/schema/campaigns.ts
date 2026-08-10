import { pgTable, text, serial, boolean, real, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const campaignsTable = pgTable("campaigns", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  imageUrl: text("image_url"),
  goal: real("goal").notNull().default(0),
  raised: real("raised").notNull().default(0),
  status: text("status").notNull().default("active"),
  featured: boolean("featured").notNull().default(false),
  category: text("category").notNull().default("general"),
  startDate: text("start_date").notNull(),
  endDate: text("end_date"),
  // Geolocalización para la vista de mapa (fase 2 del rediseño)
  latitude: real("latitude"),
  longitude: real("longitude"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertCampaignSchema = createInsertSchema(campaignsTable).omit({ id: true, createdAt: true });
export type InsertCampaign = z.infer<typeof insertCampaignSchema>;
export type Campaign = typeof campaignsTable.$inferSelect;

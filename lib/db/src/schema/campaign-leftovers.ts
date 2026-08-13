import { pgTable, text, serial, integer, real, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Sobrantes de una campaña: ítems (o dinero) que quedaron tras el evento
// (ej. "2 cajas de panetón", "S/ 50 en efectivo"). Se registran desde el panel
// admin y se muestran al público en la página de transparencia.
export const campaignLeftoversTable = pgTable("campaign_leftovers", {
  id: serial("id").primaryKey(),
  campaignId: integer("campaign_id").notNull(),
  item: text("item").notNull(),
  quantity: real("quantity").notNull().default(1),
  unit: text("unit"),
  notes: text("notes"),
  isPublic: boolean("is_public").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertCampaignLeftoverSchema = createInsertSchema(campaignLeftoversTable).omit({
  id: true,
  createdAt: true,
});
export type InsertCampaignLeftover = z.infer<typeof insertCampaignLeftoverSchema>;
export type CampaignLeftover = typeof campaignLeftoversTable.$inferSelect;

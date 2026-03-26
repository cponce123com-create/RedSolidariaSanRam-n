import { pgTable, text, serial, boolean, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const alliesTable = pgTable("allies", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull().default("empresa"),
  logo: text("logo"),
  description: text("description"),
  website: text("website"),
  contactName: text("contact_name"),
  contactEmail: text("contact_email"),
  contactPhone: text("contact_phone"),
  active: boolean("active").notNull().default(true),
  featured: boolean("featured").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertAllySchema = createInsertSchema(alliesTable).omit({
  id: true,
  createdAt: true,
});

export type InsertAlly = z.infer<typeof insertAllySchema>;
export type Ally = typeof alliesTable.$inferSelect;

import { pgTable, text, serial, integer, boolean, date, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { money } from "./money";

export const campaignExpensesTable = pgTable("campaign_expenses", {
  id: serial("id").primaryKey(),
  campaignId: integer("campaign_id").notNull(),
  description: text("description").notNull(),
  category: text("category").notNull().default("general"),
  amount: money("amount").notNull(),
  date: text("date").notNull(),
  responsible: text("responsible"),
  observations: text("observations"),
  receiptUrl: text("receipt_url"),
  receiptType: text("receipt_type"),
  isPublic: boolean("is_public").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertCampaignExpenseSchema = createInsertSchema(campaignExpensesTable).omit({ id: true, createdAt: true });
export type InsertCampaignExpense = z.infer<typeof insertCampaignExpenseSchema>;
export type CampaignExpense = typeof campaignExpensesTable.$inferSelect;

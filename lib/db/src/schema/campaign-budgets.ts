import { pgTable, text, serial, integer, real, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Presupuesto por categoría de una campaña (Fase 2.5 del Prompt Maestro).
//
// Responde a «¿cuánto teníamos previsto y cuánto llevamos gastado por rubro?»
// sin tocar el libro contable: `planned_amount` es una PREVISIÓN administrada y
// los gastos reales siguen viviendo en `campaign_expenses` (única fuente del
// dinero gastado). El saldo y el avance se derivan en el frontend con la función
// pura `buildBudget` (artifacts/red-solidaria/src/lib/budget.ts).
//
// El índice único (campaign_id, lower(category)) de la migración 016 impide
// duplicar partidas de la misma categoría en una campaña.
export const campaignBudgetsTable = pgTable("campaign_budgets", {
  id: serial("id").primaryKey(),
  campaignId: integer("campaign_id").notNull(),
  category: text("category").notNull(),
  plannedAmount: real("planned_amount").notNull().default(0),
  notes: text("notes"),
  isPublic: boolean("is_public").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertCampaignBudgetSchema = createInsertSchema(campaignBudgetsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertCampaignBudget = z.infer<typeof insertCampaignBudgetSchema>;
export type CampaignBudget = typeof campaignBudgetsTable.$inferSelect;

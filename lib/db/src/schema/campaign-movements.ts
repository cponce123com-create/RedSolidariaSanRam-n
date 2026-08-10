import { pgTable, text, serial, integer, real, timestamp } from "drizzle-orm/pg-core";
import { campaignsTable } from "./campaigns";

// Ledger inmutable de movimientos de campaña (patrón Trust Pay).
// Cadena de hashes a prueba de manipulación: cada entrada referencia el hash
// de la anterior (prev_hash) y su propio hash cubre el contenido.
// APPEND-ONLY: nunca se edita ni borra; un error de registro se revierte con
// una entrada compensatoria (o quedando la evidencia en la cadena).
export const campaignMovementsTable = pgTable("campaign_movements", {
  id: serial("id").primaryKey(),
  campaignId: integer("campaign_id")
    .notNull()
    .references(() => campaignsTable.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(), // "ingreso" | "gasto"
  amount: real("amount").notNull(),
  description: text("description").notNull(),
  sourceType: text("source_type").notNull(), // "donation" | "expense"
  sourceId: integer("source_id").notNull(),
  prevHash: text("prev_hash").notNull(),
  hash: text("hash").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type CampaignMovement = typeof campaignMovementsTable.$inferSelect;

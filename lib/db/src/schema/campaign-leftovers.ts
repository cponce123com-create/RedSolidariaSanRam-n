import { pgTable, text, serial, integer, real, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Bienes de una campaña (Fase 2 del Prompt Maestro).
//
// Se reutiliza esta tabla como almacén ÚNICO de bienes e insumos del evento:
// raciones de chocolatada, juguetes/regalos, canastas de víveres y otros
// aportes en especie. NO se crean tablas por producto.
//
// Semántica de las columnas:
//   quantity     → saldo disponible actual (columna original; sigue siendo la
//                  fuente cuando el flujo recibido/usado no se registra).
//   receivedQty  → cantidad recibida (donada o comprada).
//   usedQty      → cantidad usada/entregada.
//   targetQty    → meta del producto (p. ej. 80 juguetes); opcional.
//   category     → agrupación para mostrar (chocolatada | regalos | canastas |
//                  general).
// El saldo se deriva: `receivedQty - usedQty` cuando hay flujo registrado, y si
// no, `quantity`. La regla vive en la función pura `resolveStock`
// (artifacts/red-solidaria/src/lib/inventory.ts) para no duplicarla.
export const campaignLeftoversTable = pgTable("campaign_leftovers", {
  id: serial("id").primaryKey(),
  campaignId: integer("campaign_id").notNull(),
  item: text("item").notNull(),
  quantity: real("quantity").notNull().default(1),
  unit: text("unit"),
  notes: text("notes"),
  isPublic: boolean("is_public").notNull().default(true),
  // Migración 015 (aditiva): clasificación y flujo de bienes.
  category: text("category"),
  targetQty: real("target_qty"),
  receivedQty: real("received_qty"),
  usedQty: real("used_qty"),
  // Migración 017 (aditiva): composición de canastas y trazabilidad.
  // `composition` guarda una línea por producto ("arroz | 2 kg") y se interpreta
  // con `parseComposition`; `donorId`/`evidenceId` son opcionales (los bienes
  // anteriores a la migración quedan sin vínculo).
  composition: text("composition"),
  donorId: integer("donor_id"),
  evidenceId: integer("evidence_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertCampaignLeftoverSchema = createInsertSchema(campaignLeftoversTable).omit({
  id: true,
  createdAt: true,
});
export type InsertCampaignLeftover = z.infer<typeof insertCampaignLeftoverSchema>;
export type CampaignLeftover = typeof campaignLeftoversTable.$inferSelect;

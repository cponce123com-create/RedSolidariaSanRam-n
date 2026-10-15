import { pgTable, text, serial, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { money } from "./money";

export const donationsTable = pgTable("donations", {
  id: serial("id").primaryKey(),
  campaignId: integer("campaign_id"),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  amount: money("amount").notNull(),
  paymentMethod: text("payment_method").notNull(),
  // Fase 3: QUÉ aporta el donante (dinero, productos, servicios, apoyo
  // logístico). Solo `dinero` tiene método de pago y comprobante; una donación
  // en especie se registra con `other` y un valor estimado (puede ser 0).
  collaborationType: text("collaboration_type").notNull().default("dinero"),
  message: text("message"),
  anonymous: boolean("anonymous").notNull().default(false),
  // El donante decide si su comprobante se muestra al público
  publicProof: boolean("public_proof").notNull().default(false),
  receiptUrl: text("receipt_url"),
  receiptNote: text("receipt_note"),
  status: text("status").notNull().default("pending"),
  adminNote: text("admin_note"),
  // Fase 3: perfil de donante (persona/familia/empresa/anónimo) al que
  // pertenece la donación. Nullable: una donación puede no tener perfil.
  donorId: integer("donor_id"),
  // Conciliación bancaria trazable: cuándo y quién la confirmó. `status` pasa a
  // 'reconciled' (texto libre → sin migración de tipos).
  reconciledAt: timestamp("reconciled_at"),
  reconciledBy: text("reconciled_by"),
  // Migración 027 (aditiva): ANULACIÓN contable. Una donación ya encadenada en
  // el libro NO se borra ni se edita: pasa a `status = 'annulled'` (con lo que
  // sale de todas las cifras, que filtran por estados confirmados) y se añade un
  // ASIENTO COMPENSATORIO al libro append-only. Estas columnas son la traza de
  // quién, cuándo y por qué, igual que `reconciled_*`.
  voidedAt: timestamp("voided_at"),
  voidedBy: text("voided_by"),
  voidReason: text("void_reason"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Los campos de anulación contable son de SERVIDOR: nunca se aceptan desde el
// formulario público (anti mass-assignment), igual que el estado o la
// conciliación. Solo los escribe `POST /donations/:id/void`.
export const insertDonationSchema = createInsertSchema(donationsTable).omit({
  id: true,
  createdAt: true,
  voidedAt: true,
  voidedBy: true,
  voidReason: true,
});
export type InsertDonation = z.infer<typeof insertDonationSchema>;
export type Donation = typeof donationsTable.$inferSelect;

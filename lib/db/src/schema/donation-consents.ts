import { pgTable, text, serial, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { donationsTable } from "./donations";
import { donorsTable } from "./donors";

/**
 * Consentimientos del donante (Fase 4 · V7.1).
 *
 * APPEND-ONLY: cada fila es una DECISIÓN (otorgar o revocar) con su fecha, la
 * versión del texto aceptado y quién la registró. El estado vigente es la
 * última decisión por (donación, alcance); el historial completo se conserva,
 * así que revocar un consentimiento NO destruye ningún registro contable.
 *
 * La tabla es privada: solo el panel administrativo la consulta. Las vistas
 * públicas la usan indirectamente (a través de `resolvePublicRecognition`) para
 * decidir qué se publica.
 */
export const donationConsentsTable = pgTable("donation_consents", {
  id: serial("id").primaryKey(),
  donationId: integer("donation_id")
    .notNull()
    .references(() => donationsTable.id, { onDelete: "cascade" }),
  donorId: integer("donor_id").references(() => donorsTable.id, {
    onDelete: "set null",
  }),
  /** `public_name` | `public_proof` | `public_photo` (ver lib/donor-consent.ts). */
  scope: text("scope").notNull(),
  granted: boolean("granted").notNull(),
  /** Versión del texto de consentimiento aceptado (trazabilidad legal). */
  version: text("version").notNull(),
  /** Motivo de la revocación (obligatorio al revocar). */
  reason: text("reason"),
  /** Quién registró la decisión: `donante` o el usuario administrador. */
  recordedBy: text("recorded_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertDonationConsentSchema = createInsertSchema(
  donationConsentsTable,
).omit({ id: true, createdAt: true });
export type InsertDonationConsent = z.infer<typeof insertDonationConsentSchema>;
export type DonationConsent = typeof donationConsentsTable.$inferSelect;

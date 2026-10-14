import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Certificados con QR (Fase 5.2 del Prompt Maestro V7, B-3).
//
// Un certificado RECONOCE a una persona o entidad. La página pública muestra
// SOLO lo que la organización autoriza: nombre autorizado, tipo, título, fecha y
// (si procede) la campaña. **Nunca** el importe, el correo ni datos de contacto:
// un certificado no es un recibo.
//
// Semántica de las columnas:
//   code               → identificador público aleatorio (se dicta o se escanea
//                        desde el QR). Nunca se muestra el id interno.
//   holder_name        → nombre que la organización autoriza a publicar.
//   type               → donante | voluntario | auspiciador | colaborador |
//                        reconocimiento (los valores válidos los fija la
//                        restricción de la migración 024).
//   status             → issued (vigente) | revoked. Un certificado revocado
//                        deja de publicarse.
//   revocation_reason  → obligatorio al revocar (trazabilidad).
//   campaign_id        → opcional; si la campaña desaparece, el certificado se
//                        conserva sin vínculo (ON DELETE SET NULL).
export const certificatesTable = pgTable("certificates", {
  id: serial("id").primaryKey(),
  code: text("code").notNull(),
  holderName: text("holder_name").notNull(),
  type: text("type").notNull().default("donante"),
  title: text("title").notNull(),
  description: text("description"),
  campaignId: integer("campaign_id"),
  issuedAt: text("issued_at").notNull(),
  status: text("status").notNull().default("issued"),
  revokedAt: timestamp("revoked_at"),
  revocationReason: text("revocation_reason"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertCertificateSchema = createInsertSchema(certificatesTable).omit({
  id: true,
  createdAt: true,
  code: true,
  status: true,
  revokedAt: true,
  revocationReason: true,
});

export type InsertCertificate = z.infer<typeof insertCertificateSchema>;
export type Certificate = typeof certificatesTable.$inferSelect;

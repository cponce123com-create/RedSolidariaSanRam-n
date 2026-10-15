import { pgTable, text, serial, integer, jsonb, timestamp } from "drizzle-orm/pg-core";

/**
 * Respaldo verificable de una purga de campaña DEMO (migración 026, V7.2).
 *
 * Cada fila es la COPIA DE SEGURIDAD y el MANIFIESTO de una purga irreversible:
 * guarda el `snapshot` completo de todo lo que se eliminó (campaña, donaciones,
 * gastos, asientos del libro, evidencias, galería, novedades, presupuesto,
 * bienes) más lo que se desvinculó, y el `manifest_hash` (SHA-256 del snapshot
 * normalizado) para que cualquiera pueda recomputarlo y comprobar que el
 * respaldo no se alteró después.
 *
 * SIN clave foránea a `campaigns` a propósito: el respaldo debe SOBREVIVIR al
 * borrado de la campaña (si tuviera FK, la propia purga se llevaría la copia de
 * seguridad). Vive fuera de los datos purgados, junto al registro de auditoría.
 *
 * La tabla es privada: solo el panel administrativo (superadmin) la consulta.
 */
export const campaignPurgeBackupsTable = pgTable("campaign_purge_backups", {
  id: serial("id").primaryKey(),
  campaignId: integer("campaign_id").notNull(),
  campaignTitle: text("campaign_title").notNull(),
  campaignStatus: text("campaign_status").notNull(),
  /** SHA-256 (hex) del snapshot normalizado: el sello del manifiesto. */
  manifestHash: text("manifest_hash").notNull(),
  /** Algoritmo del sello; explícito para poder migrar de función en el futuro. */
  algorithm: text("algorithm").notNull().default("sha256"),
  /** Copia íntegra de los datos eliminados y desvinculados. */
  snapshot: jsonb("snapshot").notNull(),
  /** Motivo escrito por el superadmin (obligatorio). */
  reason: text("reason").notNull(),
  performedBy: text("performed_by"),
  performedById: text("performed_by_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type CampaignPurgeBackup = typeof campaignPurgeBackupsTable.$inferSelect;

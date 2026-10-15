import { pgTable, serial, integer, text, jsonb, timestamp, index } from "drizzle-orm/pg-core";

/**
 * CIERRE FINANCIERO DE CAMPAÑA (migración 030, V14-2.3).
 *
 * DECISIÓN DE DISEÑO: un cierre NO es un campo de estado que se sobrescribe. Es un
 * ACTO CONTABLE fechado y firmado, y por eso esta tabla es **append-only**: cada fila
 * es un evento (`closed` o `reopened`) con quién, cuándo, por qué y el informe de
 * cifras congelado en ese instante. El estado actual se DERIVA del último evento.
 *
 * Ventajas frente a un `campaigns.status = 'closed'`:
 *   · reabrir no borra la prueba de que se cerró, ni quién lo autorizó;
 *   · se puede auditar cuántas veces se cerró y reabrió una campaña;
 *   · el informe de cierre queda congelado con su hash, así que un cierre pasado no
 *     cambia porque después se editaran los datos.
 *
 * SIN CLAVE FORÁNEA a `campaigns`: el cierre debe sobrevivir a la purga de una campaña
 * DEMO (es la prueba de que existió y de cómo se cerró).
 */
export const campaignClosuresTable = pgTable(
  "campaign_closures",
  {
    id: serial("id").primaryKey(),
    campaignId: integer("campaign_id").notNull(),
    /** `closed` | `reopened` (validado además por un CHECK en la base). */
    event: text("event").notNull(),
    /** Motivo obligatorio: un cierre sin motivo no vale para la auditoría. */
    reason: text("reason").notNull(),
    /** Informe congelado en el momento del cierre (cifras + checklist). */
    report: jsonb("report").notNull(),
    /** SHA-256 del informe: permite comprobar que no se alteró después. */
    manifestHash: text("manifest_hash").notNull(),
    performedBy: text("performed_by"),
    performedById: text("performed_by_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    campaignIdx: index("idx_campaign_closures_campaign").on(table.campaignId, table.id),
  }),
);

export type CampaignClosure = typeof campaignClosuresTable.$inferSelect;

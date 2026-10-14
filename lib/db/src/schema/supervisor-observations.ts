import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Observaciones de supervisión (Fase 4).
 *
 * El rol `supervisor` es de SOLO CONSULTA: no modifica donaciones, campañas ni
 * configuración. Su única capacidad de escritura es dejar una observación sobre
 * un registro concreto; la observación es un ANEXO independiente y trazable que
 * NUNCA altera el registro observado.
 *
 * Marcar una observación como atendida (resolución) es competencia de un
 * administrador, y también queda registrada (quién y cuándo).
 */
export const supervisorObservationsTable = pgTable("supervisor_observations", {
  id: serial("id").primaryKey(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  body: text("body").notNull(),
  authorId: text("author_id"),
  authorUsername: text("author_username"),
  resolvedAt: timestamp("resolved_at"),
  resolvedBy: text("resolved_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertSupervisorObservationSchema = createInsertSchema(
  supervisorObservationsTable,
).omit({ id: true, createdAt: true, resolvedAt: true, resolvedBy: true });

export type InsertSupervisorObservation = z.infer<
  typeof insertSupervisorObservationSchema
>;
export type SupervisorObservation = typeof supervisorObservationsTable.$inferSelect;

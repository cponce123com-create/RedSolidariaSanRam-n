import { pgTable, text, serial, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const auditLogsTable = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  userId: text("user_id"), // Puede ser null para acciones del sistema
  username: text("username"), // Nombre de usuario para referencia rápida
  action: text("action").notNull(), // Ej: "LOGIN", "CREATE_CAMPAIGN", "DELETE_DONATION"
  resource: text("resource"), // Ej: "campaigns", "donations", "users"
  resourceId: text("resource_id"), // ID del recurso afectado
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  details: jsonb("details"), // Datos adicionales de la acción
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertAuditLogSchema = createInsertSchema(auditLogsTable).omit({ id: true, createdAt: true });
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
export type AuditLog = typeof auditLogsTable.$inferSelect;

import { pgTable, text, serial, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Perfil de donante (Fase 3 del Prompt Maestro).
 *
 * Un donante puede ser una persona, una familia, una empresa o anónimo. El
 * correo (normalizado, sin distinguir mayúsculas) identifica al donante cuando
 * existe; los donantes sin correo se distinguen por id.
 *
 * La información es PRIVADA: solo el panel administrativo la consulta. En los
 * endpoints públicos nunca se expone `email`/`phone` (ver formatDonor).
 */
export const donorsTable = pgTable("donors", {
  id: serial("id").primaryKey(),
  type: text("type").notNull().default("individual"),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  isRecurring: boolean("is_recurring").notNull().default(false),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertDonorSchema = createInsertSchema(donorsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertDonor = z.infer<typeof insertDonorSchema>;
export type Donor = typeof donorsTable.$inferSelect;

import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const volunteersTable = pgTable("volunteers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  age: text("age"),
  district: text("district"),
  availability: text("availability").notNull(),
  skills: text("skills"),
  interests: text("interests"),
  motivation: text("motivation"),
  priorExperience: text("prior_experience"),
  status: text("status").notNull().default("pending"),
  adminNotes: text("admin_notes"),
  // Foto del voluntario (subida opcional a Cloudinary desde el formulario
  // público; solo se muestra en el panel admin).
  photo: text("photo"),
  // ── Registro PERMANENTE (Fase 5) ─────────────────────────────────────────
  // Token opaco para que el voluntario consulte su estado sin crear cuenta.
  publicToken: text("public_token"),
  // Decisión trazable: quién aprobó y cuándo (ninguna decisión es silenciosa).
  approvedAt: timestamp("approved_at"),
  approvedBy: text("approved_by"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Los campos de servidor (estado, decisión, token) NUNCA se aceptan desde el
// formulario público: anti mass-assignment.
export const insertVolunteerSchema = createInsertSchema(volunteersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  status: true,
  adminNotes: true,
  approvedAt: true,
  approvedBy: true,
  publicToken: true,
});

export type InsertVolunteer = z.infer<typeof insertVolunteerSchema>;
export type Volunteer = typeof volunteersTable.$inferSelect;

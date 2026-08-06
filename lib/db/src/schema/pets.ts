import { pgTable, text, serial, boolean, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const petsTable = pgTable("pets", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  species: text("species").notNull(),
  breed: text("breed"),
  sex: text("sex").notNull(),
  ageCategory: text("age_category").notNull(),
  ageApprox: text("age_approx"),
  size: text("size").notNull().default("medium"),
  photos: text("photos").array(),
  description: text("description").notNull(),
  history: text("history"),
  healthStatus: text("health_status").notNull().default("good"),
  vaccinated: boolean("vaccinated").notNull().default(false),
  sterilized: boolean("sterilized").notNull().default(false),
  dewormed: boolean("dewormed").notNull().default(false),
  adoptionRequirements: text("adoption_requirements"),
  location: text("location").notNull(),
  contactName: text("contact_name").notNull(),
  contactPhone: text("contact_phone"),
  contactEmail: text("contact_email"),
  urgent: boolean("urgent").notNull().default(false),
  status: text("status").notNull().default("reviewing"),
  submittedByPublic: boolean("submitted_by_public").notNull().default(false),
  featuredOnHome: boolean("featured_on_home").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertPetSchema = createInsertSchema(petsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  status: true,
  submittedByPublic: true,
  featuredOnHome: true,
});

export const publicInsertPetSchema = createInsertSchema(petsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  status: true,
  featuredOnHome: true,
});

// Schema de actualización admin: el insert schema omite status/featuredOnHome/
// submittedByPublic (los gestiona el servidor), pero el PATCH admin SÍ debe
// poder cambiarlos (p.ej. aprobar una mascota). id/createdAt/updatedAt quedan
// excluidos: nunca se pueden modificar desde el body (anti mass-assignment).
export const updatePetSchema = insertPetSchema.partial().extend({
  status: z.enum(["available", "adopted", "in-process", "reviewing", "inactive"]).optional(),
  submittedByPublic: z.boolean().optional(),
  featuredOnHome: z.boolean().optional(),
});

export type InsertPet = z.infer<typeof insertPetSchema>;
export type Pet = typeof petsTable.$inferSelect;

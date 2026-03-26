import { pgTable, text, serial, boolean, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const adoptionRequestsTable = pgTable("adoption_requests", {
  id: serial("id").primaryKey(),
  petId: integer("pet_id").notNull(),
  requesterName: text("requester_name").notNull(),
  requesterAge: text("requester_age").notNull(),
  requesterPhone: text("requester_phone").notNull(),
  requesterEmail: text("requester_email"),
  requesterAddress: text("requester_address").notNull(),
  hasPetExperience: boolean("has_pet_experience").notNull().default(false),
  previousPets: text("previous_pets"),
  housingType: text("housing_type").notNull(),
  hasYard: boolean("has_yard").notNull().default(false),
  adoptionReason: text("adoption_reason").notNull(),
  acceptsFollowUp: boolean("accepts_follow_up").notNull().default(true),
  status: text("status").notNull().default("pending"),
  adminNotes: text("admin_notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertAdoptionRequestSchema = createInsertSchema(adoptionRequestsTable).omit({
  id: true,
  createdAt: true,
  status: true,
  adminNotes: true,
});

export type InsertAdoptionRequest = z.infer<typeof insertAdoptionRequestSchema>;
export type AdoptionRequest = typeof adoptionRequestsTable.$inferSelect;

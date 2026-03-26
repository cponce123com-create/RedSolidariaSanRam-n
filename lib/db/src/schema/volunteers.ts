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
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertVolunteerSchema = createInsertSchema(volunteersTable).omit({
  id: true,
  createdAt: true,
  status: true,
  adminNotes: true,
});

export type InsertVolunteer = z.infer<typeof insertVolunteerSchema>;
export type Volunteer = typeof volunteersTable.$inferSelect;

import {
  pgTable,
  text,
  serial,
  integer,
  boolean,
  real,
  timestamp,
} from "drizzle-orm/pg-core";
import { volunteersTable } from "./volunteers";
import { campaignsTable } from "./campaigns";

/**
 * Equipos y participación del voluntariado (Fase 5).
 *
 * - Un EQUIPO agrupa voluntarios (relación muchos a muchos).
 * - La PERTENENCIA guarda fecha de alta y de baja: al salir del equipo el
 *   historial NO se pierde, solo se cierra la vigencia.
 * - La PARTICIPACIÓN es un registro histórico (actividad, fecha y horas), nunca
 *   un contador que se pueda sobrescribir.
 */

export const volunteerTeamsTable = pgTable("volunteer_teams", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  color: text("color"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const volunteerTeamMembersTable = pgTable("volunteer_team_members", {
  id: serial("id").primaryKey(),
  volunteerId: integer("volunteer_id")
    .notNull()
    .references(() => volunteersTable.id, { onDelete: "cascade" }),
  teamId: integer("team_id")
    .notNull()
    .references(() => volunteerTeamsTable.id, { onDelete: "cascade" }),
  role: text("role"),
  joinedAt: timestamp("joined_at").defaultNow().notNull(),
  leftAt: timestamp("left_at"),
});

export const volunteerParticipationsTable = pgTable("volunteer_participations", {
  id: serial("id").primaryKey(),
  volunteerId: integer("volunteer_id")
    .notNull()
    .references(() => volunteersTable.id, { onDelete: "cascade" }),
  // Campaña vinculada (opcional): si la campaña desaparece, la participación
  // se conserva sin vínculo (ON DELETE SET NULL).
  campaignId: integer("campaign_id").references(() => campaignsTable.id, {
    onDelete: "set null",
  }),
  activityType: text("activity_type").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  hours: real("hours"),
  participatedAt: timestamp("participated_at").notNull(),
  recordedBy: text("recorded_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type VolunteerTeam = typeof volunteerTeamsTable.$inferSelect;
export type VolunteerTeamMember = typeof volunteerTeamMembersTable.$inferSelect;
export type VolunteerParticipation = typeof volunteerParticipationsTable.$inferSelect;

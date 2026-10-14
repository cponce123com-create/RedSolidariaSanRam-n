import { ROLES } from "../middleware/roles";

/**
 * Equipos y participación del voluntariado (Fase 5 del Prompt Maestro).
 *
 * Funciones PURAS y testeables.
 */

export const VOLUNTEER_ACTIVITY_TYPES = {
  brigada: "brigada",
  evento: "evento",
  taller: "taller",
  apoyo: "apoyo",
  otro: "otro",
} as const;

export type VolunteerActivityType =
  (typeof VOLUNTEER_ACTIVITY_TYPES)[keyof typeof VOLUNTEER_ACTIVITY_TYPES];

const ACTIVITY_LABEL: Record<string, string> = {
  brigada: "Brigada",
  evento: "Evento",
  taller: "Taller",
  apoyo: "Apoyo operativo",
  otro: "Otro",
};

export function activityTypeLabel(type: string): string {
  return ACTIVITY_LABEL[type] ?? type;
}

export function isActivityType(value: unknown): value is VolunteerActivityType {
  return (
    typeof value === "string" &&
    (Object.values(VOLUNTEER_ACTIVITY_TYPES) as readonly string[]).includes(value)
  );
}

export const TEAM_NAME_MIN_LENGTH = 3;
export const TEAM_NAME_MAX_LENGTH = 80;
export const PARTICIPATION_TITLE_MIN_LENGTH = 3;
export const PARTICIPATION_TITLE_MAX_LENGTH = 160;
export const PARTICIPATION_HOURS_MAX = 24;

/** Margen para aceptar una fecha de hoy con desfase de zona horaria. */
const FUTURE_TOLERANCE_MS = 24 * 60 * 60 * 1000;

export interface TeamValidationOk {
  ok: true;
  value: { name: string; description: string | null; color: string | null };
}
export type TeamValidation = TeamValidationOk | { ok: false; message: string };

/** Valida y normaliza un equipo. */
export function validateTeam(input: {
  name?: unknown;
  description?: unknown;
  color?: unknown;
}): TeamValidation {
  const name = String(input.name ?? "").trim();
  if (name.length < TEAM_NAME_MIN_LENGTH) {
    return {
      ok: false,
      message: `El nombre del equipo debe tener al menos ${TEAM_NAME_MIN_LENGTH} caracteres.`,
    };
  }
  if (name.length > TEAM_NAME_MAX_LENGTH) {
    return {
      ok: false,
      message: `El nombre del equipo no puede superar ${TEAM_NAME_MAX_LENGTH} caracteres.`,
    };
  }
  const description = typeof input.description === "string" ? input.description.trim() : "";
  const color = typeof input.color === "string" ? input.color.trim() : "";
  return {
    ok: true,
    value: { name, description: description || null, color: color || null },
  };
}

export interface ParticipationValidationOk {
  ok: true;
  value: {
    activityType: VolunteerActivityType;
    title: string;
    description: string | null;
    hours: number | null;
    participatedAt: Date;
    campaignId: number | null;
  };
}
export type ParticipationValidation =
  | ParticipationValidationOk
  | { ok: false; message: string };

/** Valida y normaliza un registro de participación. */
export function validateParticipation(input: {
  activityType?: unknown;
  title?: unknown;
  description?: unknown;
  hours?: unknown;
  participatedAt?: unknown;
  campaignId?: unknown;
  now?: Date;
}): ParticipationValidation {
  if (!isActivityType(input.activityType)) {
    return { ok: false, message: "Tipo de actividad no válido." };
  }

  const title = String(input.title ?? "").trim();
  if (title.length < PARTICIPATION_TITLE_MIN_LENGTH) {
    return {
      ok: false,
      message: `El título debe tener al menos ${PARTICIPATION_TITLE_MIN_LENGTH} caracteres.`,
    };
  }
  if (title.length > PARTICIPATION_TITLE_MAX_LENGTH) {
    return {
      ok: false,
      message: `El título no puede superar ${PARTICIPATION_TITLE_MAX_LENGTH} caracteres.`,
    };
  }

  let hours: number | null = null;
  if (input.hours !== undefined && input.hours !== null && input.hours !== "") {
    const n = Number(input.hours);
    if (!Number.isFinite(n) || n <= 0 || n > PARTICIPATION_HOURS_MAX) {
      return {
        ok: false,
        message: `Las horas deben ser un número mayor que 0 y como máximo ${PARTICIPATION_HOURS_MAX}.`,
      };
    }
    hours = Math.round(n * 100) / 100;
  }

  const date = new Date(String(input.participatedAt ?? ""));
  if (Number.isNaN(date.getTime())) {
    return { ok: false, message: "La fecha de participación no es válida." };
  }
  const now = input.now ?? new Date();
  if (date.getTime() > now.getTime() + FUTURE_TOLERANCE_MS) {
    return { ok: false, message: "La fecha de participación no puede estar en el futuro." };
  }

  const rawCampaign = Number(input.campaignId);
  const campaignId =
    Number.isInteger(rawCampaign) && rawCampaign > 0 ? rawCampaign : null;

  const description = typeof input.description === "string" ? input.description.trim() : "";

  return {
    ok: true,
    value: {
      activityType: input.activityType,
      title,
      description: description || null,
      hours,
      participatedAt: date,
      campaignId,
    },
  };
}

export interface ParticipationSummary {
  count: number;
  totalHours: number;
  lastAt: string | null;
}

/** Resumen del historial: número de participaciones, horas acumuladas y última fecha. */
export function summarizeParticipation(
  items:
    | readonly { hours?: number | null; participatedAt?: string | Date | null }[]
    | undefined
    | null,
): ParticipationSummary {
  const list = items ?? [];
  let totalHours = 0;
  let last: number | null = null;
  for (const item of list) {
    const h = Number(item.hours);
    if (Number.isFinite(h) && h > 0) totalHours += h;
    const t = item.participatedAt ? new Date(item.participatedAt).getTime() : Number.NaN;
    if (Number.isFinite(t) && (last === null || t > last)) last = t;
  }
  return {
    count: list.length,
    totalHours: Math.round(totalHours * 100) / 100,
    lastAt: last === null ? null : new Date(last).toISOString(),
  };
}

/** ¿El rol puede gestionar equipos y participación? (comunidad y administración) */
export function canManageVolunteerTeams(role: string | null | undefined): boolean {
  return (
    role === ROLES.SUPERADMIN || role === ROLES.ADMIN || role === ROLES.MODERATOR
  );
}

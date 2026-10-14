import { readErrorMessage } from "@/lib/api-error";

/**
 * Equipos y participación del voluntariado (Fase 5).
 *
 * La PERTENENCIA no se borra al salir: se cierra la vigencia (`leftAt`) y el
 * historial se conserva. La PARTICIPACIÓN es un registro histórico.
 */

export interface VolunteerTeam {
  id: number;
  name: string;
  description: string | null;
  color: string | null;
  isActive: boolean;
  activeMembers: number;
  createdAt: string | null;
}

export interface TeamMembership {
  id: number;
  teamId: number;
  teamName: string;
  color: string | null;
  role: string | null;
  active: boolean;
  joinedAt: string | null;
  leftAt: string | null;
}

export interface VolunteerParticipation {
  id: number;
  campaignId: number | null;
  activityType: string;
  activityLabel: string;
  title: string;
  description: string | null;
  hours: number | null;
  participatedAt: string | null;
  recordedBy: string | null;
  createdAt: string | null;
}

export interface ParticipationSummary {
  count: number;
  totalHours: number;
  lastAt: string | null;
}

export interface ParticipationHistory {
  items: VolunteerParticipation[];
  summary: ParticipationSummary;
}

export const VOLUNTEER_ACTIVITY_TYPES = [
  "brigada",
  "evento",
  "taller",
  "apoyo",
  "otro",
] as const;

export const VOLUNTEER_ACTIVITY_LABEL: Record<string, string> = {
  brigada: "Brigada",
  evento: "Evento",
  taller: "Taller",
  apoyo: "Apoyo operativo",
  otro: "Otro",
};

export function activityTypeLabel(type: string): string {
  return VOLUNTEER_ACTIVITY_LABEL[type] ?? type;
}

export const TEAMS_QUERY_KEY = "/api/admin/volunteer-teams";
export const MEMBERSHIPS_QUERY_KEY = "/api/admin/volunteer-memberships";
export const PARTICIPATIONS_QUERY_KEY = "/api/admin/volunteer-participations";

export function buildMembershipsUrl(volunteerId: number): string {
  return `/api/admin/volunteers/${volunteerId}/teams`;
}

export function buildParticipationsUrl(volunteerId: number): string {
  return `/api/admin/volunteers/${volunteerId}/participations`;
}

const JSON_HEADERS = { "Content-Type": "application/json" };

async function readJson<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(await readErrorMessage(res));
  return (await res.json()) as T;
}

export interface TeamInput {
  name: string;
  description?: string | null;
  color?: string | null;
  isActive?: boolean;
}

export async function fetchTeams(): Promise<VolunteerTeam[]> {
  const res = await fetch(TEAMS_QUERY_KEY, { credentials: "include" });
  return readJson<VolunteerTeam[]>(res);
}

export async function createTeam(input: TeamInput): Promise<VolunteerTeam> {
  const res = await fetch(TEAMS_QUERY_KEY, {
    method: "POST",
    headers: JSON_HEADERS,
    credentials: "include",
    body: JSON.stringify(input),
  });
  return readJson<VolunteerTeam>(res);
}

export async function updateTeam(id: number, input: TeamInput): Promise<VolunteerTeam> {
  const res = await fetch(`${TEAMS_QUERY_KEY}/${id}`, {
    method: "PUT",
    headers: JSON_HEADERS,
    credentials: "include",
    body: JSON.stringify(input),
  });
  return readJson<VolunteerTeam>(res);
}

export async function fetchMemberships(volunteerId: number): Promise<TeamMembership[]> {
  const res = await fetch(buildMembershipsUrl(volunteerId), { credentials: "include" });
  return readJson<TeamMembership[]>(res);
}

export async function assignTeam(
  volunteerId: number,
  teamId: number,
  role?: string,
): Promise<TeamMembership> {
  const res = await fetch(buildMembershipsUrl(volunteerId), {
    method: "POST",
    headers: JSON_HEADERS,
    credentials: "include",
    body: JSON.stringify(role?.trim() ? { teamId, role: role.trim() } : { teamId }),
  });
  return readJson<TeamMembership>(res);
}

export async function leaveTeam(
  volunteerId: number,
  memberId: number,
): Promise<TeamMembership> {
  const res = await fetch(`${buildMembershipsUrl(volunteerId)}/${memberId}/leave`, {
    method: "PATCH",
    credentials: "include",
  });
  return readJson<TeamMembership>(res);
}

export async function fetchParticipations(
  volunteerId: number,
): Promise<ParticipationHistory> {
  const res = await fetch(buildParticipationsUrl(volunteerId), { credentials: "include" });
  return readJson<ParticipationHistory>(res);
}

export interface ParticipationInput {
  activityType: string;
  title: string;
  description?: string | null;
  hours?: number | null;
  participatedAt: string;
  campaignId?: number | null;
}

export async function recordParticipation(
  volunteerId: number,
  input: ParticipationInput,
): Promise<VolunteerParticipation> {
  const res = await fetch(buildParticipationsUrl(volunteerId), {
    method: "POST",
    headers: JSON_HEADERS,
    credentials: "include",
    body: JSON.stringify(input),
  });
  return readJson<VolunteerParticipation>(res);
}

/** Formato de horas legible y determinista ("3.5 h"). Función pura. */
export function formatHours(hours: number | null | undefined): string {
  if (hours === null || hours === undefined) return "—";
  const n = Number(hours);
  if (!Number.isFinite(n) || n <= 0) return "—";
  return `${Math.round(n * 100) / 100} h`;
}

/**
 * Equipos que se pueden ASIGNAR: activos y en los que el voluntario no está ya
 * como miembro activo. Función pura.
 */
export function teamOptionsFor(
  teams: readonly VolunteerTeam[] | undefined | null,
  memberships: readonly TeamMembership[] | undefined | null,
): VolunteerTeam[] {
  const activeTeamIds = new Set(
    (memberships ?? []).filter((m) => m.active).map((m) => m.teamId),
  );
  return (teams ?? []).filter((team) => team.isActive && !activeTeamIds.has(team.id));
}

/** Número de equipos en los que el voluntario está ACTIVO. Función pura. */
export function countActiveTeams(
  memberships: readonly TeamMembership[] | undefined | null,
): number {
  return (memberships ?? []).filter((m) => m.active).length;
}

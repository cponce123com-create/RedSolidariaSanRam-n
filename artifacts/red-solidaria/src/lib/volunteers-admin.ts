import { readErrorMessage } from "@/lib/api-error";

/**
 * Panel de voluntariado (Fase 5).
 *
 * Los datos de postulantes son PRIVADOS (nombre, correo, teléfono, foto): todas
 * las llamadas de administración exigen sesión.
 *
 * Las transiciones válidas NO se reimplementan aquí: el servidor las envía en
 * cada postulación (`allowedTransitions`), de modo que la interfaz solo ofrece
 * acciones que el backend aceptará.
 */

export interface Volunteer {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  age: string | null;
  district: string | null;
  availability: string;
  skills: string | null;
  interests: string | null;
  motivation: string | null;
  priorExperience: string | null;
  status: string;
  statusLabel: string;
  allowedTransitions: string[];
  adminNotes: string | null;
  photo: string | null;
  /** Token del enlace de seguimiento (solo lo devuelve el endpoint admin). */
  publicToken: string | null;
  approvedAt: string | null;
  approvedBy: string | null;
  updatedAt: string | null;
  createdAt: string | null;
}

export const VOLUNTEER_STATUS_LABEL: Record<string, string> = {
  pending: "Pendiente",
  reviewing: "En revisión",
  approved: "Aprobado",
  contacted: "Contactado",
  rejected: "No procede",
};

export function volunteerStatusLabel(status: string): string {
  return VOLUNTEER_STATUS_LABEL[status] ?? status;
}

export const VOLUNTEER_STATUS_BADGE: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800 border-yellow-200",
  reviewing: "bg-blue-100 text-blue-800 border-blue-200",
  approved: "bg-green-100 text-green-800 border-green-200",
  contacted: "bg-purple-100 text-purple-800 border-purple-200",
  rejected: "bg-red-100 text-red-800 border-red-200",
};

export function volunteerStatusBadge(status: string): string {
  return VOLUNTEER_STATUS_BADGE[status] ?? "bg-secondary text-foreground";
}

export const VOLUNTEER_STATUS_TABS = [
  { value: "all", label: "Todas" },
  { value: "pending", label: "Pendientes" },
  { value: "reviewing", label: "En revisión" },
  { value: "approved", label: "Aprobados" },
  { value: "contacted", label: "Contactados" },
  { value: "rejected", label: "No procede" },
] as const;

export interface VolunteerFilters {
  status?: string;
  search?: string;
  limit?: number;
}

export const VOLUNTEERS_QUERY_KEY = "/api/admin/volunteers";

/** Construye la URL del listado con los filtros activos. Función pura. */
export function buildVolunteersUrl(filters: VolunteerFilters = {}): string {
  const params = new URLSearchParams();
  if (filters.status && filters.status !== "all") params.set("status", filters.status);
  if (filters.search?.trim()) params.set("search", filters.search.trim());
  if (filters.limit) params.set("limit", String(filters.limit));
  const qs = params.toString();
  return `/api/admin/volunteers${qs ? `?${qs}` : ""}`;
}

const JSON_HEADERS = { "Content-Type": "application/json" };

export async function fetchVolunteers(
  filters: VolunteerFilters = {},
): Promise<Volunteer[]> {
  const res = await fetch(buildVolunteersUrl(filters), { credentials: "include" });
  if (!res.ok) throw new Error(await readErrorMessage(res));
  return (await res.json()) as Volunteer[];
}

export async function fetchVolunteer(id: number): Promise<Volunteer> {
  const res = await fetch(`/api/admin/volunteers/${id}`, { credentials: "include" });
  if (!res.ok) throw new Error(await readErrorMessage(res));
  return (await res.json()) as Volunteer;
}

export async function updateVolunteerStatus(
  id: number,
  status: string,
  adminNotes?: string,
): Promise<Volunteer> {
  const res = await fetch(`/api/admin/volunteers/${id}`, {
    method: "PATCH",
    headers: JSON_HEADERS,
    credentials: "include",
    body: JSON.stringify(adminNotes === undefined ? { status } : { status, adminNotes }),
  });
  if (!res.ok) throw new Error(await readErrorMessage(res));
  return (await res.json()) as Volunteer;
}

export interface VolunteerStatusInfo {
  status: string;
  statusLabel: string;
  updatedAt: string | null;
}

/** Consulta pública del estado con el token (divulgación mínima). */
export async function fetchVolunteerStatus(token: string): Promise<VolunteerStatusInfo> {
  const res = await fetch(`/api/volunteers/status/${encodeURIComponent(token)}`);
  if (!res.ok) throw new Error(await readErrorMessage(res));
  return (await res.json()) as VolunteerStatusInfo;
}

/**
 * Enlace de seguimiento que se envía al voluntario. Apunta a la página pública
 * de estado, que solo muestra el estado (sin datos personales).
 */
export function trackingLink(token: string, origin?: string): string {
  const base = origin ?? (typeof window !== "undefined" ? window.location.origin : "");
  return `${base}/voluntariado/estado/${token}`;
}

/** Resumen de la decisión: quién y cuándo. `null` si aún no hay decisión. */
export function decisionSummary(
  volunteer: Pick<Volunteer, "status" | "approvedBy" | "approvedAt">,
): string | null {
  if (volunteer.status !== "approved" && volunteer.status !== "rejected") return null;
  const who = volunteer.approvedBy || "—";
  if (!volunteer.approvedAt) return `Decidido por ${who}`;
  const date = new Date(volunteer.approvedAt);
  if (Number.isNaN(date.getTime())) return `Decidido por ${who}`;
  return `Decidido por ${who} el ${date.toLocaleDateString("es-PE")}`;
}

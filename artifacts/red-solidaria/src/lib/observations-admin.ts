import { readErrorMessage } from "@/lib/api-error";

/**
 * Observaciones de supervisión (Fase 4).
 *
 * El supervisor es un rol de SOLO CONSULTA: la observación es su única
 * escritura y nunca modifica el registro observado (es un anexo).
 */

export interface Observation {
  id: number;
  entityType: string;
  entityLabel: string;
  entityId: string;
  body: string;
  authorUsername: string | null;
  resolved: boolean;
  resolvedBy: string | null;
  resolvedAt: string | null;
  createdAt: string | null;
}

export const OBSERVATION_ENTITY_TYPES = [
  "donation",
  "campaign",
  "movement",
  "donor",
] as const;

export type ObservationEntityType = (typeof OBSERVATION_ENTITY_TYPES)[number];

export const OBSERVATION_ENTITY_LABEL: Record<string, string> = {
  donation: "Donación",
  campaign: "Campaña",
  movement: "Movimiento contable",
  donor: "Donante",
};

export function observationEntityLabel(type: string): string {
  return OBSERVATION_ENTITY_LABEL[type] ?? type;
}

export const OBSERVATION_MIN_LENGTH = 5;

export const OBSERVATIONS_QUERY_KEY = "/api/admin/observations";

export interface ObservationFilters {
  entityType?: string;
  entityId?: string;
  pending?: boolean;
  limit?: number;
}

/** Construye la URL del listado con los filtros activos. Función pura. */
export function buildObservationsUrl(filters: ObservationFilters = {}): string {
  const params = new URLSearchParams();
  if (filters.entityType) params.set("entityType", filters.entityType);
  if (filters.entityId) params.set("entityId", filters.entityId);
  if (filters.pending) params.set("pending", "true");
  if (filters.limit) params.set("limit", String(filters.limit));
  const qs = params.toString();
  return `/api/admin/observations${qs ? `?${qs}` : ""}`;
}

export interface ObservationInput {
  entityType: string;
  entityId: string;
  body: string;
}

const JSON_HEADERS = { "Content-Type": "application/json" };

export async function fetchObservations(
  filters: ObservationFilters = {},
): Promise<Observation[]> {
  const res = await fetch(buildObservationsUrl(filters), { credentials: "include" });
  if (!res.ok) throw new Error(await readErrorMessage(res));
  return (await res.json()) as Observation[];
}

export async function createObservation(input: ObservationInput): Promise<Observation> {
  const res = await fetch("/api/admin/observations", {
    method: "POST",
    headers: JSON_HEADERS,
    credentials: "include",
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(await readErrorMessage(res));
  return (await res.json()) as Observation;
}

export async function resolveObservation(id: number): Promise<Observation> {
  const res = await fetch(`/api/admin/observations/${id}/resolve`, {
    method: "PATCH",
    credentials: "include",
  });
  if (!res.ok) throw new Error(await readErrorMessage(res));
  return (await res.json()) as Observation;
}

/** Observaciones aún sin atender. Función pura. */
export function countPending(
  observations: readonly Pick<Observation, "resolved">[] | undefined | null,
): number {
  return (observations ?? []).filter((o) => !o.resolved).length;
}

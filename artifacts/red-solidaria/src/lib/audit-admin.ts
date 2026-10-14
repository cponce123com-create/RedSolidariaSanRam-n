import { readErrorMessage } from "@/lib/api-error";

/**
 * Cliente y presentación del REGISTRO DE AUDITORÍA (Fase 4).
 *
 * Solo lectura y solo para administradores: muestra QUIÉN hizo QUÉ, CUÁNDO y
 * sobre qué recurso. Es la evidencia visible de que ninguna corrección
 * contable es silenciosa.
 */

export interface AuditLogEntry {
  id: number;
  action: string;
  resource: string | null;
  resourceId: string | null;
  username: string | null;
  userId: string | null;
  ipAddress: string | null;
  details: unknown;
  createdAt: string | null;
}

export const AUDIT_ACTION_LABEL: Record<string, string> = {
  DONATION_APPROVED: "Donación aprobada",
  DONATION_REJECTED: "Donación rechazada",
  DONATION_STATUS_CHANGED: "Estado de donación cambiado",
  DONATION_RECONCILED: "Donación conciliada con el banco",
  CAMPAIGN_STATUS_CHANGED: "Estado de campaña cambiado",
  CAMPAIGN_DELETED: "Borrador de campaña eliminado",
  DONOR_CREATED: "Donante creado",
  DONOR_UPDATED: "Donante actualizado",
};

export function auditActionLabel(action: string): string {
  return AUDIT_ACTION_LABEL[action] ?? action;
}

export const AUDIT_RESOURCE_LABEL: Record<string, string> = {
  donations: "Donaciones",
  campaigns: "Campañas",
  donors: "Donantes",
  users: "Usuarios",
  settings: "Configuración",
};

export function auditResourceLabel(resource: string | null | undefined): string {
  if (!resource) return "—";
  return AUDIT_RESOURCE_LABEL[resource] ?? resource;
}

export interface AuditFilters {
  action?: string;
  resource?: string;
  username?: string;
  limit?: number;
  offset?: number;
}

export const AUDIT_LOGS_QUERY_KEY = "/api/admin/audit-logs";

/** Construye la URL del endpoint con los filtros activos. Función pura. */
export function buildAuditLogsUrl(filters: AuditFilters = {}): string {
  const params = new URLSearchParams();
  if (filters.action) params.set("action", filters.action);
  if (filters.resource) params.set("resource", filters.resource);
  if (filters.username?.trim()) params.set("username", filters.username.trim());
  if (filters.limit) params.set("limit", String(filters.limit));
  if (filters.offset) params.set("offset", String(filters.offset));
  const qs = params.toString();
  return `/api/admin/audit-logs${qs ? `?${qs}` : ""}`;
}

export async function fetchAuditLogs(
  filters: AuditFilters = {},
): Promise<AuditLogEntry[]> {
  const res = await fetch(buildAuditLogsUrl(filters), { credentials: "include" });
  if (!res.ok) throw new Error(await readErrorMessage(res));
  return (await res.json()) as AuditLogEntry[];
}

function formatAuditValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return String(value);
  }
  return JSON.stringify(value);
}

/**
 * Resumen legible de los `details` para la tabla: nunca se vuelca un objeto
 * crudo (evita exponer estructuras inesperadas en la interfaz).
 */
export function summarizeAuditDetails(details: unknown): string {
  if (!details || typeof details !== "object") return "—";
  const entries = Object.entries(details as Record<string, unknown>);
  if (entries.length === 0) return "—";
  return entries.map(([key, value]) => `${key}: ${formatAuditValue(value)}`).join(" · ");
}

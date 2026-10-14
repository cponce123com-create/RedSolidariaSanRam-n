import type { QueryClient } from "@tanstack/react-query";
import { ApiError, errorMessage, readErrorMessage } from "@/lib/api-error";

/**
 * Cliente del ciclo de vida de campañas (Fase 1 del Prompt Maestro).
 *
 * Los endpoints de transición de estado y de borrado no forman parte del
 * cliente generado por Orval, así que se llaman directamente. Todos exigen
 * sesión de administrador (cookie) y devuelven `{ error, message }` en fallo:
 * aquí se convierte ese mensaje REAL en el texto que ve el administrador.
 *
 * El error de API y el lector de mensajes viven en `lib/api-error` (compartidos
 * con el panel de donantes); se re-exporta el alias de campaña para no romper
 * los imports existentes.
 */

export { ApiError as CampaignApiError, errorMessage };

export type CampaignStatus =
  | "draft"
  | "active"
  | "paused"
  | "completed"
  | "archived";

export async function setCampaignStatus(
  id: number,
  status: CampaignStatus,
): Promise<void> {
  const res = await fetch(`/api/campaigns/${id}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new ApiError(res.status, await readErrorMessage(res));
}

/** Elimina permanentemente un borrador (el backend rechaza con 409 si no lo es). */
export async function deleteCampaignDraft(id: number): Promise<void> {
  const res = await fetch(`/api/campaigns/${id}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) throw new ApiError(res.status, await readErrorMessage(res));
}

/**
 * Invalida TODAS las consultas de campañas (lista con cualquier filtro y
 * detalle) más `settings` (protagonista). React Query invalida por prefijo, y
 * la clave del detalle (`["/api/campaigns/5"]`) NO es prefijo de la lista
 * (`["/api/campaigns"]`): por eso se usa un predicado sobre `queryKey[0]`.
 * Así el panel y el frontend público se sincronizan sin recargar.
 */
export function invalidateCampaignQueries(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({
    predicate: (q) =>
      Array.isArray(q.queryKey) && q.queryKey[0] === "/api/campaigns",
  });
  void queryClient.invalidateQueries({ queryKey: ["settings"] });
}

/**
 * Fija (o limpia con `null`) la campaña protagonista de la portada.
 * La portada pública la muestra en el primer bloque si está activa y no vencida.
 */
export async function setProtagonistCampaign(campaignId: number | null): Promise<void> {
  const res = await fetch("/api/admin/protagonist-campaign", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ campaignId }),
  });
  if (!res.ok) throw new ApiError(res.status, await readErrorMessage(res));
}

export interface SettingEntry {
  key: string;
  value: string;
  label?: string;
  group?: string;
}

/** Crea o actualiza una configuración (el backend hace upsert). */
export async function saveSetting(entry: SettingEntry): Promise<void> {
  const res = await fetch(`/api/admin/settings/${encodeURIComponent(entry.key)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      value: entry.value,
      ...(entry.label ? { label: entry.label } : {}),
      ...(entry.group ? { group: entry.group } : {}),
    }),
  });
  if (!res.ok) throw new ApiError(res.status, await readErrorMessage(res));
}

/** Guarda varias configuraciones (p. ej. los datos del evento ChocoFest). */
export async function saveSettings(entries: SettingEntry[]): Promise<void> {
  await Promise.all(entries.map((entry) => saveSetting(entry)));
}

// ─── Presentación del ciclo de vida (etiquetas, colores y acciones) ──────────

export const CAMPAIGN_STATUS_LABEL: Record<CampaignStatus, string> = {
  draft: "Borrador",
  active: "Activa",
  paused: "Pausada",
  completed: "Finalizada",
  archived: "Archivada",
};

export const CAMPAIGN_STATUS_BADGE: Record<CampaignStatus, string> = {
  draft: "bg-muted text-muted-foreground hover:bg-muted",
  active: "bg-accent hover:bg-accent/90",
  paused: "bg-yellow-500 hover:bg-yellow-600",
  completed: "bg-secondary text-foreground hover:bg-secondary/80",
  archived: "bg-slate-500 hover:bg-slate-600",
};

export function campaignStatusLabel(status: string): string {
  return CAMPAIGN_STATUS_LABEL[status as CampaignStatus] ?? status;
}

export function campaignStatusBadge(status: string): string {
  return (
    CAMPAIGN_STATUS_BADGE[status as CampaignStatus] ??
    "bg-secondary text-foreground"
  );
}

export interface LifecycleAction {
  status: CampaignStatus;
  label: string;
  /** Confirmación previa (acción sensible). */
  confirm?: string;
  destructive?: boolean;
}

/**
 * Acciones disponibles para el estado actual. Refleja las transiciones que el
 * backend permite (`campaign-lifecycle.ts`); el backend vuelve a validarlas y
 * responde 409 con un mensaje si algo no cuadra.
 */
export function lifecycleActions(current: string): LifecycleAction[] {
  switch (current) {
    case "draft":
      return [{ status: "active", label: "Publicar" }];
    case "active":
      return [
        { status: "paused", label: "Pausar" },
        { status: "completed", label: "Finalizar" },
        {
          status: "draft",
          label: "Despublicar",
          confirm: "Se ocultará del sitio público hasta volver a publicarla. ¿Continuar?",
        },
        {
          status: "archived",
          label: "Archivar",
          confirm:
            "Se ocultará de los listados públicos y conservará su historial contable. ¿Continuar?",
        },
      ];
    case "paused":
      return [
        { status: "active", label: "Reanudar" },
        { status: "completed", label: "Finalizar" },
        {
          status: "draft",
          label: "Despublicar",
          confirm: "Se ocultará del sitio público hasta volver a publicarla. ¿Continuar?",
        },
        {
          status: "archived",
          label: "Archivar",
          confirm:
            "Se ocultará de los listados públicos y conservará su historial contable. ¿Continuar?",
        },
      ];
    case "completed":
      return [
        { status: "active", label: "Reabrir", confirm: "Volverá a recibir colaboraciones. ¿Continuar?" },
        {
          status: "archived",
          label: "Archivar",
          confirm:
            "Se ocultará de los listados públicos y conservará su historial contable. ¿Continuar?",
        },
      ];
    case "archived":
      return [
        {
          status: "completed",
          label: "Restaurar",
          confirm: "Volverá a mostrarse como historial (finalizada). ¿Continuar?",
        },
      ];
    default:
      return [];
  }
}

/** Un borrador sin dependencias es el único borrado permanente permitido. */
export function canPermanentlyDelete(status: string): boolean {
  return status === "draft";
}

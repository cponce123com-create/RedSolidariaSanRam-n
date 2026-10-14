import type { QueryClient } from "@tanstack/react-query";

/**
 * Cliente del ciclo de vida de campañas (Fase 1 del Prompt Maestro).
 *
 * Los endpoints de transición de estado y de borrado no forman parte del
 * cliente generado por Orval, así que se llaman directamente. Todos exigen
 * sesión de administrador (cookie) y devuelven `{ error, message }` en fallo:
 * aquí se convierte ese mensaje REAL en el texto que ve el administrador.
 */

export type CampaignStatus =
  | "draft"
  | "active"
  | "paused"
  | "completed"
  | "archived";

export class CampaignApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "CampaignApiError";
    this.status = status;
  }
}

async function readErrorMessage(res: Response): Promise<string> {
  try {
    const body: unknown = await res.json();
    if (body && typeof body === "object") {
      const candidate = body as { message?: unknown; error?: unknown };
      if (typeof candidate.message === "string" && candidate.message.trim()) {
        return candidate.message;
      }
      if (typeof candidate.error === "string" && candidate.error.trim()) {
        return candidate.error;
      }
    }
  } catch {
    // cuerpo no-JSON: se usa el mensaje genérico
  }
  return `No se pudo completar la operación (HTTP ${res.status})`;
}

/** Mensaje legible para cualquier error de mutación. */
export function errorMessage(err: unknown, fallback = "Error inesperado"): string {
  if (err instanceof Error && err.message.trim()) return err.message;
  return fallback;
}

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
  if (!res.ok) throw new CampaignApiError(res.status, await readErrorMessage(res));
}

/** Elimina permanentemente un borrador (el backend rechaza con 409 si no lo es). */
export async function deleteCampaignDraft(id: number): Promise<void> {
  const res = await fetch(`/api/campaigns/${id}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) throw new CampaignApiError(res.status, await readErrorMessage(res));
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

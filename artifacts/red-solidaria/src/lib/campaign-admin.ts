import type { QueryClient } from "@tanstack/react-query";
import { ApiError, errorMessage, readErrorMessage } from "@/lib/api-error";
import { invalidateEntities } from "@/lib/query-invalidation";
import type { CampaignDeletionDiagnostic } from "./campaign-deletion";
import type { DemoPurgeAnalysis, DemoPurgeResult } from "./campaign-demo-purge";

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
 * Diagnóstico previo a la eliminación (Fase 1.2): dependencias clasificadas,
 * motivo concreto del bloqueo y operaciones permitidas. NO borra nada. La
 * interfaz lo muestra antes de confirmar cualquier eliminación.
 */
export async function fetchCampaignDeletionDiagnostic(
  id: number,
): Promise<CampaignDeletionDiagnostic> {
  const res = await fetch(`/api/campaigns/${id}/deletion-diagnostic`, {
    credentials: "include",
  });
  if (!res.ok) throw new ApiError(res.status, await readErrorMessage(res));
  return (await res.json()) as CampaignDeletionDiagnostic;
}

/**
 * Purga de datos de prueba (Fase 1.3, Modalidad C). Exige rol superadmin en el
 * servidor y un motivo escrito; el servidor rechaza con 409 si hay contabilidad
 * real (asientos, gastos o donaciones confirmadas).
 */
export async function purgeCampaignTestData(
  id: number,
  reason: string,
): Promise<void> {
  const res = await fetch(`/api/campaigns/${id}/test-purge`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ confirm: true, reason }),
  });
  if (!res.ok) throw new ApiError(res.status, await readErrorMessage(res));
}

/**
 * Invalida TODAS las consultas de campañas (lista con cualquier filtro, detalle
 * y subrecursos públicos/administrativos) más `settings` (protagonista).
 *
 * El predicado de entidad vive en `lib/query-keys.ts`: cubre tanto las claves
 * compuestas (`["/api/campaigns", 5, "transparency"]`) como las claves de un
 * solo string del cliente generado (`["/api/campaigns/5"]`), que era la causa
 * de que el detalle público siguiera mostrando datos viejos tras editar en el
 * panel.
 */
export function invalidateCampaignQueries(queryClient: QueryClient): void {
  invalidateEntities(queryClient, ["campaigns", "settings"]);
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
 *
 * En un borrador se ofrecen Publicar Y Archivar: un borrador con dependencias
 * (imágenes, novedades, reportes) no puede eliminarse —sería destruir
 * historial— y sin archivar quedaba atrapado para siempre.
 */
export function lifecycleActions(current: string): LifecycleAction[] {
  switch (current) {
    case "draft":
      return [
        { status: "active", label: "Publicar" },
        {
          status: "archived",
          label: "Archivar",
          confirm:
            "Se retirará el borrador de la vista de trabajo conservando sus registros (imágenes, novedades, reportes). ¿Continuar?",
        },
      ];
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

/**
 * Presentación del diagnóstico de borrado: el tipo y los helpers viven en
 * `lib/campaign-deletion.ts` (puros y testeables) y se re-exportan aquí para que
 * el panel los consuma desde un único punto de entrada del dominio de campañas.
 *
 * Ya NO existe `canPermanentlyDelete(status)`: que una campaña sea borrador no
 * basta —depende de sus dependencias reales—, así que la decisión la da el
 * diagnóstico del servidor (`canDelete`), no el estado.
 */
export {
  canPurgeTestData,
  deletionHeadline,
  describeDependencies,
  findOperation,
  groupDependencies,
  totalOf,
} from "./campaign-deletion";
export type {
  CampaignDeletionDiagnostic,
  DeletionDependency,
  DeletionDiagnostic,
  DeletionOperation,
  GroupedDependencies,
} from "./campaign-deletion";

// ─── Purga definitiva de campañas DEMO (V7.2) ────────────────────────────────

/**
 * Análisis de seguridad de la purga DEMO (exclusivo del superadmin). Devuelve el
 * nombre, el identificador, el estado, el recuento y los tipos de registros
 * relacionados, el estado del libro contable y el veredicto. NO borra nada.
 */
export async function fetchDemoPurgePreview(id: number): Promise<DemoPurgeAnalysis> {
  const res = await fetch(`/api/campaigns/${id}/demo-purge/preview`, {
    credentials: "include",
  });
  if (!res.ok) throw new ApiError(res.status, await readErrorMessage(res));
  return (await res.json()) as DemoPurgeAnalysis;
}

export interface DemoPurgeCredentials {
  /** Contraseña actual del superadmin (reautenticación). */
  password: string;
  /** Código TOTP, solo si la cuenta tiene 2FA activo. */
  totpCode?: string;
}

/**
 * Declara una campaña como DEMO. Exige reautenticación en el servidor: es una
 * afirmación explícita del administrador, no una inferencia del sistema.
 */
export async function markCampaignDemo(
  id: number,
  payload: DemoPurgeCredentials & { reason: string },
): Promise<void> {
  const res = await fetch(`/api/campaigns/${id}/demo-mark`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      confirm: true,
      reason: payload.reason,
      password: payload.password,
      ...(payload.totpCode ? { totpCode: payload.totpCode } : {}),
    }),
  });
  if (!res.ok) throw new ApiError(res.status, await readErrorMessage(res));
}

/** Retira la declaración DEMO (si se marcó por error). */
export async function unmarkCampaignDemo(id: number, reason?: string): Promise<void> {
  const res = await fetch(`/api/campaigns/${id}/demo-mark`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(reason ? { reason } : {}),
  });
  if (!res.ok) throw new ApiError(res.status, await readErrorMessage(res));
}

/**
 * ELIMINA DEFINITIVAMENTE una campaña DEMO y sus datos de prueba.
 *
 * Irreversible. El servidor exige superadmin, reautenticación, motivo, el
 * identificador escrito a mano y confirmación explícita; si el análisis detecta
 * datos reales responde 409 con el motivo exacto y no modifica nada.
 */
export async function purgeDemoCampaign(
  id: number,
  payload: DemoPurgeCredentials & { identifier: string; reason: string },
): Promise<DemoPurgeResult> {
  const res = await fetch(`/api/campaigns/${id}/demo-purge`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      confirm: true,
      identifier: payload.identifier,
      reason: payload.reason,
      password: payload.password,
      ...(payload.totpCode ? { totpCode: payload.totpCode } : {}),
    }),
  });
  if (!res.ok) throw new ApiError(res.status, await readErrorMessage(res));
  return (await res.json()) as DemoPurgeResult;
}

/**
 * Helpers de presentación de la purga DEMO (puros y testeables), re-exportados
 * para que el panel los consuma desde el mismo punto de entrada del dominio.
 */
export {
  MIN_DEMO_REASON,
  affectedTables,
  blockerSummary,
  canPurgeDemoCampaign,
  demoPurgeHeadline,
  demoPurgeSteps,
  demoPurgeSummary,
  describeLedger,
  describePlan,
  identifierMatches,
  needsDemoMarking,
  shortHash,
  totalOfPlan,
} from "./campaign-demo-purge";
export type {
  DemoPurgeAnalysis,
  DemoPurgeCampaign,
  DemoPurgeChainSummary,
  DemoPurgeCounts,
  DemoPurgeIssue,
  DemoPurgeLedgerState,
  DemoPurgeManifest,
  DemoPurgePlanEntry,
  DemoPurgeRealSignals,
  DemoPurgeResult,
  DemoPurgeStep,
  DemoPurgeSummary,
  DemoPurgeTableKey,
  DemoPurgeVerdict,
} from "./campaign-demo-purge";

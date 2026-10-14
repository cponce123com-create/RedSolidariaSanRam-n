/**
 * Ciclo de vida de campañas (Prompt Maestro, Fase 1).
 *
 * Todo lo de este módulo son FUNCIONES PURAS: describen los estados válidos,
 * las transiciones permitidas y las reglas de borrado permanente. La ruta HTTP
 * (`routes/campaigns.ts`) las usa y los tests las verifican sin tocar la DB.
 *
 * Estados (columna `campaigns.status`, texto libre — no requiere migración):
 *   draft      → borrador, NO publicado (oculto al público).
 *   active     → publicado y recibiendo colaboraciones.
 *   paused     → publicado pero en pausa.
 *   completed  → finalizado; visible como historial.
 *   archived   → retirado; oculto de los listados públicos (el detalle y su
 *                libro contable siguen accesibles).
 */

export const CAMPAIGN_STATUSES = [
  "draft",
  "active",
  "paused",
  "completed",
  "archived",
] as const;

export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

/** Estados que no deben aparecer en los listados públicos. */
export const HIDDEN_STATUSES = ["draft", "archived"] as const;

/**
 * Clave de `settings` que guarda el id de la campaña protagonista de la portada.
 * Fuente única de verdad; debe coincidir con PROTAGONIST_SETTING_KEY del
 * frontend (`artifacts/red-solidaria/src/lib/chocofest.ts`).
 */
export const PROTAGONIST_SETTING_KEY = "protagonist_campaign_id";

export function isCampaignStatus(value: unknown): value is CampaignStatus {
  return (
    typeof value === "string" &&
    (CAMPAIGN_STATUSES as readonly string[]).includes(value)
  );
}

export function isHiddenStatus(status: string | null | undefined): boolean {
  return status === "draft" || status === "archived";
}

/**
 * Transiciones permitidas del ciclo de vida.
 * - draft → active            (publicar)
 * - active ↔ paused           (pausar / reanudar)
 * - active/paused → draft     (despublicar)
 * - active/paused → completed (finalizar)
 * - completed → active        (reabrir)
 * - active/paused/completed → archived (archivar)
 * - archived → completed      (restaurar como historial visible)
 *
 * Un borrador NO se archiva (se publica o se elimina si no tiene dependencias).
 */
const TRANSITIONS: Record<CampaignStatus, readonly CampaignStatus[]> = {
  draft: ["active"],
  active: ["paused", "completed", "draft", "archived"],
  paused: ["active", "completed", "draft", "archived"],
  completed: ["active", "archived"],
  archived: ["completed"],
};

export function allowedTransitions(from: string): CampaignStatus[] {
  if (!isCampaignStatus(from)) return [];
  return [...TRANSITIONS[from]];
}

export function canTransition(from: string, to: string): boolean {
  if (!isCampaignStatus(from) || !isCampaignStatus(to)) return false;
  return TRANSITIONS[from].includes(to);
}

const STATUS_LABEL: Record<CampaignStatus, string> = {
  draft: "borrador",
  active: "activa",
  paused: "pausada",
  completed: "finalizada",
  archived: "archivada",
};

export function statusLabel(status: string): string {
  return isCampaignStatus(status) ? STATUS_LABEL[status] : status;
}

/** Mensaje accionable cuando una transición no está permitida. */
export function transitionError(from: string, to: string): string {
  const allowed = allowedTransitions(from).map(statusLabel).join(", ");
  return `No se puede pasar una campaña ${statusLabel(from)} a ${statusLabel(to)}.${
    allowed ? ` Estados permitidos: ${allowed}.` : ""
  }`;
}

export interface CampaignDependencies {
  donations: number;
  movements: number;
  expenses: number;
  evidence: number;
  leftovers: number;
  images: number;
  updates: number;
}

export const EMPTY_DEPENDENCIES: CampaignDependencies = {
  donations: 0,
  movements: 0,
  expenses: 0,
  evidence: 0,
  leftovers: 0,
  images: 0,
  updates: 0,
};

export function totalDependencies(deps: CampaignDependencies): number {
  return Object.values(deps).reduce((sum, n) => sum + n, 0);
}

/**
 * Motivo por el que NO se puede borrar una campaña de forma permanente, o
 * `null` si el borrado es seguro.
 *
 * Regla (Prompt Maestro): solo se eliminan DEFINITIVAMENTE borradores sin
 * dependencias ni movimientos financieros. Nunca se borra en cascada historial
 * contable: una campaña con historial se archiva.
 */
export function deleteBlockReason(
  status: string,
  deps: CampaignDependencies,
): string | null {
  if (status !== "draft") {
    return `Solo se pueden eliminar campañas en borrador. Una campaña ${statusLabel(
      status,
    )} debe archivarse para conservar su historial contable.`;
  }
  const total = totalDependencies(deps);
  if (total > 0) {
    return `El borrador tiene ${total} registro(s) asociado(s) (donaciones, movimientos del libro, gastos, evidencias, sobrantes, imágenes o novedades) y no puede eliminarse. Archívalo o revisa sus registros.`;
  }
  return null;
}

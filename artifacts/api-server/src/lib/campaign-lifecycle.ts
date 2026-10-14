/**
 * Ciclo de vida de campañas (Prompt Maestro, Fase 1 · corrección V7.1).
 *
 * Todo lo de este módulo son FUNCIONES PURAS: describen los estados válidos,
 * las transiciones permitidas, la clasificación de dependencias y las reglas de
 * borrado permanente. La ruta HTTP (`routes/campaigns.ts`) las usa y los tests
 * las verifican sin tocar la DB.
 *
 * Estados (columna `campaigns.status`, texto libre — no requiere migración):
 *   draft      → borrador, NO publicado (oculto al público).
 *   active     → publicado y recibiendo colaboraciones.
 *   paused     → publicado pero en pausa.
 *   completed  → finalizado; visible como historial.
 *   archived   → retirado; oculto de los listados públicos (el detalle y su
 *                libro contable siguen accesibles).
 *
 * ─── Clasificación de dependencias (V7.1 · Fase 1.1) ─────────────────────────
 *
 * El bloqueo anterior era demasiado grueso: CUALQUIER fila dependiente impedía
 * eliminar un borrador, de modo que una galería de fotos o una novedad sin
 * valor contable dejaban la campaña atrapada. Ahora las dependencias se
 * clasifican según su NATURALEZA REAL:
 *
 *  A. PROTEGIDAS — historial financiero/contable/documental con obligación de
 *     conservación. Nunca se borran al eliminar la campaña: bloquean la
 *     eliminación definitiva y obligan a ARCHIVAR.
 *  B. AUXILIARES ELIMINABLES — contenido de presentación sin vínculo financiero
 *     (galería, novedades, partidas de presupuesto, evidencias de actividad sin
 *     relación con una transacción, bienes de referencia sin movimientos). Se
 *     limpian dentro de la misma transacción del borrado seguro.
 *  C. DESVINCULABLES — relaciones que se pueden soltar sin destruir el registro
 *     (reportes ciudadanos: se pone `campaign_id = NULL`, NO se borran).
 *
 * No se asume que un registro sea eliminable por su TIPO: la ruta comprueba
 * estado, procedencia y relaciones antes de clasificarlo (una evidencia ligada
 * a un bien entregado es PROTEGIDA, no auxiliar).
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
 * - draft → archived          (descartar un borrador CONSERVANDO su traza)
 * - active ↔ paused           (pausar / reanudar)
 * - active/paused → draft     (despublicar)
 * - active/paused → completed (finalizar)
 * - completed → active        (reabrir)
 * - active/paused/completed → archived (archivar)
 * - archived → completed      (restaurar como historial visible)
 *
 * Por qué `draft → archived`: un borrador con dependencias PROTEGIDAS no puede
 * eliminarse —borrar en cascada destruiría historial— y antes tampoco podía
 * archivarse, así que quedaba atrapado para siempre. Archivarlo es la salida
 * segura: desaparece de los listados y conserva todo.
 */
const TRANSITIONS: Record<CampaignStatus, readonly CampaignStatus[]> = {
  draft: ["active", "archived"],
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

// ─── Clasificación de dependencias ───────────────────────────────────────────

/**
 * Recuento de dependencias de una campaña, separado por naturaleza.
 *
 * Las claves de evidencias y bienes están partidas en dos: la ruta decide cuál
 * es cuál consultando relaciones reales (una evidencia usada como prueba de una
 * entrega es protegida; una foto de actividad sin vínculo es auxiliar).
 */
export interface CampaignDependencies {
  // A. Protegidas (historial financiero / documental).
  donations: number;
  movements: number;
  expenses: number;
  protectedEvidence: number;
  protectedLeftovers: number;
  // B. Auxiliares eliminables.
  images: number;
  updates: number;
  budgets: number;
  auxiliaryEvidence: number;
  auxiliaryLeftovers: number;
  // C. Desvinculables (se conservan; solo se sueltan de la campaña).
  communityReports: number;
}

export const EMPTY_DEPENDENCIES: CampaignDependencies = {
  donations: 0,
  movements: 0,
  expenses: 0,
  protectedEvidence: 0,
  protectedLeftovers: 0,
  images: 0,
  updates: 0,
  budgets: 0,
  auxiliaryEvidence: 0,
  auxiliaryLeftovers: 0,
  communityReports: 0,
};

export type ProtectedDependencyKey =
  | "donations"
  | "movements"
  | "expenses"
  | "protectedEvidence"
  | "protectedLeftovers";
export type RemovableDependencyKey =
  | "images"
  | "updates"
  | "budgets"
  | "auxiliaryEvidence"
  | "auxiliaryLeftovers";
export type UnlinkableDependencyKey = "communityReports";

export const PROTECTED_DEPENDENCY_KEYS: readonly ProtectedDependencyKey[] = [
  "donations",
  "movements",
  "expenses",
  "protectedEvidence",
  "protectedLeftovers",
];

export const REMOVABLE_DEPENDENCY_KEYS: readonly RemovableDependencyKey[] = [
  "images",
  "updates",
  "budgets",
  "auxiliaryEvidence",
  "auxiliaryLeftovers",
];

export const UNLINKABLE_DEPENDENCY_KEYS: readonly UnlinkableDependencyKey[] = [
  "communityReports",
];

const DEPENDENCY_LABEL: Record<keyof CampaignDependencies, string> = {
  donations: "donaciones",
  movements: "movimientos del libro contable",
  expenses: "gastos ejecutados",
  protectedEvidence: "evidencias vinculadas a movimientos",
  protectedLeftovers: "bienes recibidos o entregados",
  images: "imágenes de galería",
  updates: "novedades de la campaña",
  budgets: "partidas de presupuesto",
  auxiliaryEvidence: "evidencias de actividad",
  auxiliaryLeftovers: "bienes de referencia sin movimientos",
  communityReports: "reportes ciudadanos",
};

export function dependencyLabel(key: keyof CampaignDependencies): string {
  return DEPENDENCY_LABEL[key];
}

function sumKeys(
  deps: CampaignDependencies,
  keys: readonly (keyof CampaignDependencies)[],
): number {
  return keys.reduce((sum, key) => sum + (deps[key] ?? 0), 0);
}

/** Dependencias que impiden la eliminación definitiva. */
export function protectedDependencies(deps: CampaignDependencies): number {
  return sumKeys(deps, PROTECTED_DEPENDENCY_KEYS);
}

/**
 * Dependencias no bloqueantes: las auxiliares (se borran) y las desvinculables
 * (se sueltan). Ninguna impide la eliminación definitiva.
 */
export function auxiliaryDependencies(deps: CampaignDependencies): number {
  return (
    sumKeys(deps, REMOVABLE_DEPENDENCY_KEYS) +
    sumKeys(deps, UNLINKABLE_DEPENDENCY_KEYS)
  );
}

export function totalDependencies(deps: CampaignDependencies): number {
  return protectedDependencies(deps) + auxiliaryDependencies(deps);
}

export interface DependencyEntry {
  key: keyof CampaignDependencies;
  label: string;
  count: number;
  disposition: "protected" | "delete" | "unlink";
}

/** Desglose completo, con la disposición de cada dependencia. */
export function dependencyBreakdown(
  deps: CampaignDependencies,
): DependencyEntry[] {
  const entries: DependencyEntry[] = [];
  for (const key of PROTECTED_DEPENDENCY_KEYS) {
    if (deps[key] > 0) {
      entries.push({ key, label: DEPENDENCY_LABEL[key], count: deps[key], disposition: "protected" });
    }
  }
  for (const key of REMOVABLE_DEPENDENCY_KEYS) {
    if (deps[key] > 0) {
      entries.push({ key, label: DEPENDENCY_LABEL[key], count: deps[key], disposition: "delete" });
    }
  }
  for (const key of UNLINKABLE_DEPENDENCY_KEYS) {
    if (deps[key] > 0) {
      entries.push({ key, label: DEPENDENCY_LABEL[key], count: deps[key], disposition: "unlink" });
    }
  }
  return entries;
}

/**
 * Motivo por el que NO se puede borrar una campaña de forma permanente, o
 * `null` si el borrado es seguro.
 *
 * Regla (V7.1 · Fase 1.3, Modalidad A): solo se eliminan DEFINITIVAMENTE
 * borradores cuyas únicas dependencias sean auxiliares (galería, novedades,
 * presupuestos, evidencias de actividad sin vínculo financiero, bienes de
 * referencia) o desvinculables (reportes ciudadanos). Una dependencia PROTEGIDA
 * (donación, movimiento del libro, gasto, evidencia/bien con obligación de
 * conservación) obliga a archivar. Nunca se borra en cascada historial contable.
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
  const protectedEntries = dependencyBreakdown(deps).filter(
    (entry) => entry.disposition === "protected",
  );
  if (protectedEntries.length > 0) {
    const detail = protectedEntries
      .map((entry) => `${entry.count} ${entry.label}`)
      .join(", ");
    const count = protectedDependencies(deps);
    return `El borrador conserva ${count} registro(s) protegido(s) (${detail}) que no pueden eliminarse: borrarlos destruiría historial financiero o documental. Archívalo para conservar la traza.`;
  }
  return null;
}

export type AllowedOperation = "delete" | "archive" | "restore" | "testPurge";

export interface OperationAvailability {
  operation: AllowedOperation;
  label: string;
  available: boolean;
  /** Motivo por el que NO está disponible (solo si `available` es false). */
  reason?: string;
}

export interface DeleteDiagnostic {
  status: string;
  statusLabel: string;
  canDelete: boolean;
  canArchive: boolean;
  blockedReason: string | null;
  total: number;
  protectedCount: number;
  auxiliaryCount: number;
  dependencies: DependencyEntry[];
  operations: OperationAvailability[];
}

/**
 * Diagnóstico completo previo a cualquier eliminación (Fase 1.2). La ruta
 * administrativa lo devuelve tal cual para que la interfaz explique, antes de
 * confirmar, qué impide borrar y qué alternativas existen.
 */
export function deleteDiagnostic(
  status: string,
  deps: CampaignDependencies,
): DeleteDiagnostic {
  const blockedReason = deleteBlockReason(status, deps);
  const canDelete = blockedReason === null;
  const canArchive = canTransition(status, "archived");
  const protectedCount = protectedDependencies(deps);
  const auxiliaryCount = auxiliaryDependencies(deps);

  const operations: OperationAvailability[] = [
    {
      operation: "delete",
      label: "Eliminación definitiva",
      available: canDelete,
      ...(canDelete ? {} : { reason: blockedReason ?? "No disponible" }),
    },
    {
      operation: "archive",
      label: "Archivar (conserva historial)",
      available: canArchive,
      ...(canArchive
        ? {}
        : { reason: `No se puede archivar una campaña ${statusLabel(status)}.` }),
    },
    {
      operation: "testPurge",
      label: "Purga de datos de prueba",
      available: status === "draft" && deps.movements === 0,
      ...(status === "draft" && deps.movements === 0
        ? {}
        : {
            reason:
              deps.movements > 0
                ? "La campaña tiene asientos en el libro contable: no admite purga."
                : "Solo los borradores admiten purga de datos de prueba.",
          }),
    },
  ];

  return {
    status,
    statusLabel: statusLabel(status),
    canDelete,
    canArchive,
    blockedReason,
    total: totalDependencies(deps),
    protectedCount,
    auxiliaryCount,
    dependencies: dependencyBreakdown(deps),
    operations,
  };
}

/**
 * Motivo por el que una campaña NO puede ser la protagonista de la portada, o
 * `null` si es válida. La portada solo puede destacar campañas visibles al
 * público: fijar un borrador o una archivada dejaría el bloque vacío sin que el
 * administrador supiera por qué.
 */
export function protagonistError(status: string): string | null {
  if (isHiddenStatus(status)) {
    return `Una campaña ${statusLabel(
      status,
    )} no se muestra en el sitio público y no puede ser la protagonista de la portada. Publícala primero.`;
  }
  return null;
}

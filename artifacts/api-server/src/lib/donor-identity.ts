/**
 * Identidad de donante, estados de donación, detección de duplicados y
 * conciliación trazable (Fase 3 del Prompt Maestro).
 *
 * Funciones PURAS y testeables (sin DB): la ruta HTTP las usa y los tests las
 * verifican sin base de datos.
 */

export const DONOR_TYPES = [
  "individual",
  "familia",
  "empresa",
  "organizacion",
  "anonimo",
] as const;
export type DonorType = (typeof DONOR_TYPES)[number];

export function isDonorType(value: unknown): value is DonorType {
  return (
    typeof value === "string" && (DONOR_TYPES as readonly string[]).includes(value)
  );
}

const DONOR_TYPE_LABEL: Record<DonorType, string> = {
  individual: "Persona",
  familia: "Familia",
  empresa: "Empresa",
  organizacion: "Organización",
  anonimo: "Anónimo",
};

export function donorTypeLabel(type: string): string {
  return isDonorType(type) ? DONOR_TYPE_LABEL[type] : type;
}

// ─── Tipos de colaboración ───────────────────────────────────────────────────

/**
 * QUÉ aporta el donante. Solo `dinero` implica monto mínimo y comprobante de
 * pago: una donación en especie (productos, servicios, apoyo logístico) no
 * tiene método de pago y su valor es un estimado que puede ser 0.
 */
export const COLLABORATION_TYPES = [
  "dinero",
  "productos",
  "servicios",
  "logistica",
] as const;
export type CollaborationType = (typeof COLLABORATION_TYPES)[number];

export function isCollaborationType(value: unknown): value is CollaborationType {
  return (
    typeof value === "string" &&
    (COLLABORATION_TYPES as readonly string[]).includes(value)
  );
}

/**
 * Tipo por defecto. Todo lo anterior a la Fase 3 era dinero, así que un valor
 * ausente o desconocido se interpreta como dinero (nunca al revés: no se puede
 * dejar sin monto ni sin comprobante una donación que sí lo exigía).
 */
export const DEFAULT_COLLABORATION_TYPE: CollaborationType = "dinero";

export function normalizeCollaborationType(value: unknown): CollaborationType {
  return isCollaborationType(value) ? value : DEFAULT_COLLABORATION_TYPE;
}

/** Solo una colaboración de dinero exige monto y comprobante de pago. */
export function collaborationRequiresAmount(value: unknown): boolean {
  return normalizeCollaborationType(value) === "dinero";
}

/** Normaliza un correo: sin espacios y en minúsculas (identidad del donante). */
export function normalizeEmail(email: unknown): string {
  return typeof email === "string" ? email.trim().toLowerCase() : "";
}

/** Estados de una donación. `reconciled` se añade en Fase 3 (sin migración). */
export const DONATION_STATUSES = [
  "pending",
  "approved",
  "rejected",
  "reconciled",
] as const;
export type DonationStatus = (typeof DONATION_STATUSES)[number];

export function isDonationStatus(value: unknown): value is DonationStatus {
  return (
    typeof value === "string" && (DONATION_STATUSES as readonly string[]).includes(value)
  );
}

/**
 * Estados que cuentan como DINERO CONFIRMADO. `reconciled` es una EVOLUCIÓN de
 * `approved` (conciliación bancaria), no un estado aparte: los agregados
 * (recaudado, número de donantes, transparencia, dashboard) deben sumar AMBOS.
 * Omitir `reconciled` haría que el total BAJARA al conciliar una donación.
 */
export const CONFIRMED_DONATION_STATUSES = ["approved", "reconciled"] as const;

export function isConfirmedDonationStatus(status: string): boolean {
  return (CONFIRMED_DONATION_STATUSES as readonly string[]).includes(status);
}

// ─── Conciliación bancaria trazable ──────────────────────────────────────────

/**
 * Solo se concilia una donación YA APROBADA. Así nunca se altera el estado de
 * una donación no confirmada ni se "salta" la verificación administrativa.
 */
export function canReconcile(status: string): boolean {
  return status === "approved";
}

/** Motivo por el que NO se puede conciliar, o `null` si es posible. */
export function reconcileBlockReason(status: string): string | null {
  if (status === "reconciled") return "La donación ya está conciliada.";
  if (!canReconcile(status)) {
    return `Solo se pueden conciliar donaciones aprobadas. Estado actual: ${status}.`;
  }
  return null;
}

// ─── Detección de duplicados probables ───────────────────────────────────────

export interface DonationLike {
  id?: number;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  amount: number | string;
  createdAt: Date | string;
}

function toAmountString(amount: number | string): string {
  const n = typeof amount === "number" ? amount : Number(amount);
  return Number.isFinite(n) ? n.toFixed(2) : String(amount);
}

function toDay(value: Date | string): string {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? "" : value.toISOString().slice(0, 10);
  }
  return String(value).slice(0, 10);
}

/**
 * Clave de duplicado probable: mismo correo, mismo monto y mismo DÍA.
 * Deliberadamente más laxa que `donationKey` (que compara la marca de tiempo
 * completa): un doble envío del formulario cae el mismo día con segundos
 * distintos.
 */
export function donationDedupKey(d: DonationLike): string {
  return [normalizeEmail(d.email), toAmountString(d.amount), toDay(d.createdAt)].join("|");
}

/**
 * Agrupa donaciones con la misma clave de duplicado. Devuelve solo los grupos
 * con 2 o más elementos, de mayor a menor.
 *
 * Las donaciones SIN correo se ignoran: no se puede afirmar que sean el mismo
 * donante, y agruparlas por monto+fecha daría falsos positivos.
 */
export function findDuplicateGroups<T extends DonationLike>(
  items: readonly T[],
): T[][] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    if (!normalizeEmail(item.email)) continue;
    const key = donationDedupKey(item);
    const bucket = groups.get(key);
    if (bucket) bucket.push(item);
    else groups.set(key, [item]);
  }
  return [...groups.values()]
    .filter((group) => group.length > 1)
    .sort((a, b) => b.length - a.length);
}

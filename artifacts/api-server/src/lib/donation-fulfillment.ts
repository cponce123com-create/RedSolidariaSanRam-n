/**
 * Cumplimiento del aporte (V20 · Fase 6). Funciones PURAS y testeables.
 *
 * POR QUÉ UNA COLUMNA APARTE: el estado CONTABLE de una donación (`status`:
 * pending|approved|rejected|reconciled|annulled) es la ÚNICA fuente de las cifras
 * y del libro de transparencia: `approved|reconciled` crean asiento y suman al
 * recaudado. Mezclar ahí «comprometida» o «recibida» rompería la contabilidad y
 * haría que una PROMESA contara como ingreso.
 *
 * Por eso el ciclo de vida real del aporte vive en `fulfillment_status`, paralelo
 * y sin efecto contable:
 *
 *   pendiente_coordinacion → comprometida → recibida → verificada
 *                                     ↘ rechazada_cancelada ↗ (desde cualquier
 *                                                             estado no verificado)
 *
 * Una donación PROMETIDA no es una donación RECIBIDA, y una RECIBIDA todavía
 * puede necesitar VERIFICACIÓN antes de darse por buena.
 */

export const FULFILLMENT_STATUSES = [
  "pendiente_coordinacion",
  "comprometida",
  "recibida",
  "verificada",
  "rechazada_cancelada",
] as const;
export type FulfillmentStatus = (typeof FULFILLMENT_STATUSES)[number];

export const DEFAULT_FULFILLMENT_STATUS: FulfillmentStatus = "pendiente_coordinacion";

export function isFulfillmentStatus(value: unknown): value is FulfillmentStatus {
  return (
    typeof value === "string" &&
    (FULFILLMENT_STATUSES as readonly string[]).includes(value)
  );
}

export function normalizeFulfillmentStatus(value: unknown): FulfillmentStatus {
  return isFulfillmentStatus(value) ? value : DEFAULT_FULFILLMENT_STATUS;
}

/**
 * Transiciones autorizadas. Hacia delante (coordinación → compromiso → recepción
 * → verificación) y a `rechazada_cancelada` desde cualquier estado no verificado.
 * `verificada` es TERMINAL: es la constancia de que el aporte llegó y se comprobó,
 * así que no se deshace por la vía normal (una corrección exige una operación
 * administrativa auditada, no un simple cambio de estado).
 */
export const FULFILLMENT_TRANSITIONS: Record<string, readonly string[]> = {
  pendiente_coordinacion: ["comprometida", "recibida", "rechazada_cancelada"],
  comprometida: ["recibida", "rechazada_cancelada"],
  recibida: ["verificada", "rechazada_cancelada"],
  verificada: [],
  // Reabrir una donación cancelada es legítimo: el donante puede retomar el
  // compromiso. Vuelve al inicio del ciclo.
  rechazada_cancelada: ["pendiente_coordinacion"],
};

export function isAllowedFulfillmentTransition(from: string, to: string): boolean {
  return FULFILLMENT_TRANSITIONS[from]?.includes(to) ?? false;
}

/** Motivo por el que NO se permite la transición, o `null` si es válida. */
export function fulfillmentBlockReason(from: string, to: string): string | null {
  if (!isFulfillmentStatus(from) || !isFulfillmentStatus(to)) {
    return "Estado de cumplimiento inválido.";
  }
  if (from === to) return `La donación ya está en «${fulfillmentLabel(from)}».`;
  if (isAllowedFulfillmentTransition(from, to)) return null;
  if (from === "verificada") {
    return "Una donación verificada no se puede cambiar por la vía normal: registra una corrección auditada.";
  }
  return `No se puede pasar de «${fulfillmentLabel(from)}» a «${fulfillmentLabel(to)}».`;
}

const FULFILLMENT_STATUS_LABEL: Record<FulfillmentStatus, string> = {
  pendiente_coordinacion: "Pendiente de coordinación",
  comprometida: "Comprometida",
  recibida: "Recibida",
  verificada: "Verificada",
  rechazada_cancelada: "Rechazada o cancelada",
};

export function fulfillmentLabel(status: string): string {
  return isFulfillmentStatus(status)
    ? FULFILLMENT_STATUS_LABEL[status]
    : status;
}

/**
 * Estados que cuentan como PRODUCTO/SERVICIO EFECTIVAMENTE recibido: solo lo
 * RECIBIDO o VERIFICADO. Un compromiso pendiente no suma a las cifras de
 * productos, igual que una promesa de dinero no suma al recaudado.
 */
export const FULFILLED_STATUSES = ["recibida", "verificada"] as const;

export function isFulfilledStatus(status: string): boolean {
  return (FULFILLED_STATUSES as readonly string[]).includes(status);
}

/** Estados que cuentan como VERIFICADO (lo único publicable en la galería). */
export function isVerifiedStatus(status: string): boolean {
  return status === "verificada";
}

/**
 * ¿Se puede editar libremente el aporte? Solo mientras esté en coordinación: una
 * vez comprometido o recibido, lo que hay que actualizar es el estado (y, como
 * mucho, la cantidad recibida), no reescribir la donación.
 */
export function canEditFreely(status: string): boolean {
  return status === "pendiente_coordinacion";
}

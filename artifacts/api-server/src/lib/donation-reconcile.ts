/**
 * Reconciliación idempotente de donaciones sembradas (hallazgos IMP-01/IMP-04).
 *
 * Sustituye el patrón destructivo `DELETE` + `INSERT` de los importadores
 * (`scripts/src/apply-*.ts`) por un "diff" por clave natural: solo se insertan
 * las donaciones que aún no están presentes; **nunca** se borra ni se
 * sobrescribe una fila existente. Así se preservan las donaciones reales
 * creadas por la API y las ediciones del panel admin.
 *
 * El diff es de tipo multiconjunto: si la fuente tiene dos entradas idénticas
 * y la BD solo una, se inserta exactamente una (no se pierde la duplicada).
 *
 * Funciones PURAS y testeables (sin DB).
 */

export interface ReconcileDonation {
  firstName: string;
  lastName: string;
  amount: number | string;
  paymentMethod: string;
  message?: string | null;
  createdAt: Date | string;
}

function toAmountString(amount: number | string): string {
  const n = typeof amount === "number" ? amount : Number(amount);
  return Number.isFinite(n) ? n.toFixed(2) : String(amount);
}

function toIsoString(value: Date | string): string {
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toISOString();
}

/** Clave natural estable de una donación (insensible a number/string y Date/ISO). */
export function donationKey(d: ReconcileDonation): string {
  return [
    d.firstName.trim(),
    d.lastName.trim(),
    toAmountString(d.amount),
    d.paymentMethod,
    d.message ?? "",
    toIsoString(d.createdAt),
  ].join("|");
}

export interface ReconcilePlan<T> {
  /** Donaciones de la fuente que faltan en la BD (a insertar). */
  toInsert: T[];
  /** Cuántas ya estaban presentes (no se tocan). */
  alreadyPresent: number;
}

/**
 * Plan de inserción idempotente (multiconjunto): devuelve solo las donaciones
 * de `seed` que no tienen una equivalente en `existing`, respetando el conteo.
 */
export function planDonationInsert<T extends ReconcileDonation>(
  seed: readonly T[],
  existing: readonly ReconcileDonation[],
): ReconcilePlan<T> {
  const remaining = new Map<string, number>();
  for (const d of existing) {
    const k = donationKey(d);
    remaining.set(k, (remaining.get(k) ?? 0) + 1);
  }

  const toInsert: T[] = [];
  for (const d of seed) {
    const k = donationKey(d);
    const available = remaining.get(k) ?? 0;
    if (available > 0) {
      remaining.set(k, available - 1);
    } else {
      toInsert.push(d);
    }
  }

  return { toInsert, alreadyPresent: seed.length - toInsert.length };
}

/**
 * Utilidades para interpretar errores del driver de PostgreSQL sin recurrir a
 * casts: se inspecciona el campo `code` (SQLSTATE) de forma segura.
 *
 * 23503 = foreign_key_violation
 */
export function hasPgErrorCode(err: unknown, code: string): boolean {
  if (typeof err !== "object" || err === null) return false;
  const candidate: { code?: unknown } = err;
  return candidate.code === code;
}

/**
 * La FK del ledger es ON DELETE RESTRICT: intentar borrar una campaña que ya
 * tiene movimientos registrados viola la FK (23503). Debe responder 409, no 500.
 */
export function isForeignKeyViolation(err: unknown): boolean {
  return hasPgErrorCode(err, "23503");
}

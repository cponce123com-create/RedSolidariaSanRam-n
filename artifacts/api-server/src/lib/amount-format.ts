/**
 * Monto seguro: acepta number O string numérico y devuelve un number finito.
 *
 * pg devuelve las columnas `numeric` como string ("50.00"); el customType
 * `money` (lib/db) los convierte en la frontera con `Number(value)`, pero el
 * resultado depende de cómo drizzle aplique el mapper según la forma de la
 * query (proyección por tabla vs por columna) y de la versión bundleada.
 * `typeof value === "number" ? value : Number(value)` garantiza que un monto
 * válido NUNCA se convierta en 0 por llegar como string, y que un valor
 * realmente corrupto (null, "", NaN) caiga a 0 en vez de romper el frontend.
 */
export function toSafeAmount(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

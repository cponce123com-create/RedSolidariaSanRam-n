/**
 * Serializa una fecha a ISO de forma defensiva: si el valor es nulo o un Date
 * inválido (timestamp corrupto en BD), devuelve null en vez de lanzar
 * RangeError y tumbar la respuesta de la API.
 */
export function toIsoSafe(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

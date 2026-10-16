/**
 * Validación del WhatsApp peruano en el navegador (V20 · Fase 3).
 *
 * Es un ESPEJO de `api-server/src/lib/donation-tracking.ts`: el servidor vuelve a
 * validar siempre (nunca se confía en el navegador), pero aquí se avisa al donante
 * al instante para que no llegue al final del formulario con un error.
 */

/**
 * Normaliza un móvil peruano a `+51XXXXXXXXX`. Acepta espacios, guiones,
 * paréntesis, el prefijo `+51`/`51` y un `0` inicial. Devuelve `""` si no es un
 * móvil peruano válido (9 dígitos que empiezan por 9).
 */
export function normalizePePhone(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const digits = raw.replace(/\D/g, "");
  let local = digits;
  if (local.startsWith("51") && local.length === 11) local = local.slice(2);
  if (local.startsWith("0") && local.length === 10) local = local.slice(1);
  if (local.length !== 9 || !local.startsWith("9")) return "";
  return `+51${local}`;
}

export function isValidPePhone(raw: unknown): boolean {
  return normalizePePhone(raw) !== "";
}

/** Enlace de WhatsApp listo para usar, o `null` si el número no es válido. */
export function whatsappLink(raw: unknown, message?: string): string | null {
  const normalized = normalizePePhone(raw);
  if (!normalized) return null;
  const text = message ? `?text=${encodeURIComponent(message)}` : "";
  return `https://wa.me/${normalized.slice(1)}${text}`;
}

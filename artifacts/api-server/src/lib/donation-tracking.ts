/**
 * Código de seguimiento, teléfono peruano e idempotencia (V20 · Fase 2/3).
 * Funciones PURAS y testeables.
 *
 * El donante recibe un CÓDIGO ÚNICO con el que puede consultar su aporte. También
 * se normaliza el WhatsApp (formato peruano de 9 dígitos o +51) y la clave de
 * idempotencia que evita que un doble envío cree dos donaciones.
 */

// ─── Teléfono peruano ────────────────────────────────────────────────────────
/**
 * Normaliza un teléfono peruano a `+51XXXXXXXXX` (E.164). Acepta espacios,
 * guiones, paréntesis, el prefijo `+51` o `51`, y un `0` inicial opcional.
 * Devuelve `""` si no es un móvil peruano válido (9 dígitos que empiezan por 9).
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

// ─── Código de seguimiento ───────────────────────────────────────────────────
/**
 * Alfabeto sin caracteres ambiguos (sin I, O, 0, 1): el código se dicta por
 * teléfono o se copia de una captura, así que hay que poder leerlo sin dudas.
 */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const TRACKING_CODE_LENGTH = 6;
export const TRACKING_CODE_PREFIX = "RSR";

/**
 * `RSR-<año>-<6 caracteres>`. Recibe `now` y `random` inyectables para poder
 * probarlo de forma determinista.
 */
export function generateTrackingCode(
  now: Date = new Date(),
  random: () => number = Math.random,
): string {
  let code = "";
  for (let i = 0; i < TRACKING_CODE_LENGTH; i += 1) {
    const index = Math.min(
      CODE_ALPHABET.length - 1,
      Math.max(0, Math.floor(random() * CODE_ALPHABET.length)),
    );
    code += CODE_ALPHABET[index];
  }
  return `${TRACKING_CODE_PREFIX}-${now.getUTCFullYear()}-${code}`;
}

export function isValidTrackingCode(value: unknown): boolean {
  return (
    typeof value === "string" &&
    /^RSR-\d{4}-[A-HJ-NP-Z2-9]{6}$/.test(value.trim())
  );
}

// ─── Idempotencia ────────────────────────────────────────────────────────────
export const MAX_DEDUPE_TOKEN_LENGTH = 64;

/**
 * Clave de idempotencia del formulario. Se genera al ABRIR el modal y viaja en el
 * envío: si el navegador reintenta (doble clic, red que se corta), el servidor
 * reconoce la clave y devuelve la MISMA donación en lugar de crear otra.
 * Formato: 8–64 caracteres de `[A-Za-z0-9_-]`. Cualquier otra cosa se descarta.
 */
export function normalizeDedupeToken(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const token = value.trim();
  if (token.length < 8 || token.length > MAX_DEDUPE_TOKEN_LENGTH) return null;
  return /^[A-Za-z0-9_-]+$/.test(token) ? token : null;
}

export function isValidDedupeToken(value: unknown): boolean {
  return normalizeDedupeToken(value) !== null;
}

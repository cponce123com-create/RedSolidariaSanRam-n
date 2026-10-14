/**
 * Contacto por WhatsApp configurable (Prompt Maestro V7, Fase 7).
 *
 * El número estaba FIJO en el código del sitio (y el catálogo de bienes usaba
 * incluso un número de ejemplo, `51999999999`, que se abría en producción).
 * Ahora el número y los mensajes predefinidos se leen de `settings` (claves
 * públicas, editables desde el panel). Si no hay número configurado, la
 * interfaz NO inventa uno: simplemente no ofrece el enlace.
 *
 * Funciones PURAS y testeables (sin React ni red).
 */

export const WHATSAPP_SETTING_KEYS = {
  number: "org_whatsapp",
  general: "whatsapp_message_general",
  donation: "whatsapp_message_donation",
  volunteer: "whatsapp_message_volunteer",
  sponsor: "whatsapp_message_sponsor",
} as const;

export type WhatsAppPurpose = "general" | "donation" | "volunteer" | "sponsor";

/**
 * Normaliza el número a solo dígitos con código de país. Acepta espacios,
 * guiones, paréntesis y el prefijo `+`. Devuelve `null` si el valor está vacío
 * o no tiene entre 8 y 15 dígitos: nunca se completa a mano un número dudoso.
 */
export function normalizeWhatsAppNumber(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const digits = value.replace(/\D/g, "");
  return digits.length >= 8 && digits.length <= 15 ? digits : null;
}

/** Número para mostrar: `+51 921 615 737`. `null` si no es utilizable. */
export function formatWhatsAppNumber(value: unknown): string | null {
  const digits = normalizeWhatsAppNumber(value);
  if (!digits) return null;
  const rest = digits.slice(2);
  const groups = rest.match(/.{1,3}/g) ?? [];
  return `+${digits.slice(0, 2)} ${groups.join(" ")}`.trim();
}

/** Enlace `wa.me` con mensaje opcional. `null` si no hay número utilizable. */
export function buildWhatsAppUrl(
  number: unknown,
  message?: string | null,
): string | null {
  const digits = normalizeWhatsAppNumber(number);
  if (!digits) return null;
  const text = typeof message === "string" ? message.trim() : "";
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}

export interface WhatsAppContact {
  /** Solo dígitos, con código de país. */
  number: string;
  /** Formato legible para la interfaz. */
  display: string;
  /** Enlace listo para usar. */
  url: string;
}

/**
 * Resuelve el contacto para un propósito concreto. El mensaje configurado en el
 * panel gana; si está vacío se usa el texto por defecto del idioma activo, que
 * se recibe como argumento para no acoplar esta lógica a i18n.
 */
export function resolveWhatsAppContact(
  settings: Record<string, string> | undefined | null,
  purpose: WhatsAppPurpose,
  fallbackMessage: string,
): WhatsAppContact | null {
  const number = normalizeWhatsAppNumber(settings?.[WHATSAPP_SETTING_KEYS.number]);
  if (!number) return null;

  const configured = settings?.[WHATSAPP_SETTING_KEYS[purpose]] ?? "";
  const url = buildWhatsAppUrl(number, configured.trim() || fallbackMessage);
  if (!url) return null;

  return {
    number,
    display: formatWhatsAppNumber(number) ?? number,
    url,
  };
}

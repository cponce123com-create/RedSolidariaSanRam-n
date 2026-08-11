// Locale de date-fns según el idioma activo: sustituye a los
// `import { es } from "date-fns/locale"` hardcodeados en las páginas.
import { es as esLocale, enUS } from "date-fns/locale";
import type { Locale } from "date-fns";
import { format } from "date-fns";
import { getAppLanguage } from "./index";

export function getDateFormatLocale(): Locale {
  return getAppLanguage() === "en" ? enUS : esLocale;
}

/**
 * Formatea una fecha de forma defensiva: si el valor es nulo o inválido
 * (datos corruptos en BD/API), devuelve "—" en vez de lanzar
 * RangeError: Invalid time value (que tumbaba páginas en producción).
 */
export function formatSafeDate(
  value: string | Date | null | undefined,
  formatStr: string,
  options?: Parameters<typeof format>[2],
): string {
  if (value == null) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return format(d, formatStr, options);
}

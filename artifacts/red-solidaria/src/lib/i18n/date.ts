// Locale de date-fns según el idioma activo: sustituye a los
// `import { es } from "date-fns/locale"` hardcodeados en las páginas.
import { es as esLocale, enUS } from "date-fns/locale";
import type { Locale } from "date-fns";
import { getAppLanguage } from "./index";

export function getDateFormatLocale(): Locale {
  return getAppLanguage() === "en" ? enUS : esLocale;
}

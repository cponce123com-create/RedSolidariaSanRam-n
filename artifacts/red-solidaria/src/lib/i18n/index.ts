// Init global de i18next (react-i18next). Importar UNA vez antes del render
// (main.tsx) para que las traducciones estén disponibles de forma síncrona.
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { es } from "./locales/es";
import { en } from "./locales/en";

export const STORAGE_KEY = "rs_lang";
export type AppLanguage = "es" | "en";

/** Idioma inicial: localStorage → preferencia del navegador → español. */
export function getInitialLanguage(): AppLanguage {
  if (typeof window === "undefined") return "es";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === "es" || stored === "en") return stored;
  return window.navigator.language?.toLowerCase().startsWith("en") ? "en" : "es";
}

void i18n.use(initReactI18next).init({
  resources: {
    es: { translation: es },
    en: { translation: en },
  },
  lng: getInitialLanguage(),
  fallbackLng: "es",
  interpolation: { escapeValue: false },
  // Recursos estáticos + Suspense: evitamos que el primer render se suspenda
  // (las rutas lazy de wouter ya usan Suspense; no queremos encadenar fallbacks).
  react: { useSuspense: false },
});

/** Idioma activo normalizado (solo "es" o "en"). */
export function getAppLanguage(): AppLanguage {
  return i18n.language?.toLowerCase().startsWith("en") ? "en" : "es";
}

/** Cambia el idioma y persiste la preferencia (localStorage + <html lang>). */
export function setAppLanguage(lang: AppLanguage) {
  void i18n.changeLanguage(lang);
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, lang);
    document.documentElement.lang = lang;
  }
}

export default i18n;

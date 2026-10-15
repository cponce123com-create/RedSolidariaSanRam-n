/**
 * Claves de consulta del frontend (Prompt Maestro, Fase 1 — sincronización).
 *
 * FUENTE ÚNICA DE VERDAD de las claves de TanStack Query. El problema real que
 * resolvía este módulo: el panel de administración invalidaba claves con un
 * prefijo exacto (`queryKey[0] === "/api/campaigns"`) mientras que el cliente
 * generado por Orval guarda el detalle y sus subrecursos como UN SOLO STRING
 * (`["/api/campaigns/5"]`, `["/api/campaigns/5/donors"]`). Esas claves nunca
 * coincidían, así que el detalle público seguía mostrando datos viejos.
 *
 * Este archivo es PURO y SIN DEPENDENCIAS a propósito: se compila con esbuild
 * para las pruebas de `node:test` (ver `build-tests.mjs`). La capa que usa
 * `QueryClient` vive en `lib/query-invalidation.ts`.
 *
 * Convención de claves observada en el proyecto (no se cambia aquí):
 *   ["/api/campaigns", filtros]           lista pública/admin
 *   ["/api/campaigns/5"]                  detalle (cliente generado)
 *   ["/api/campaigns/5", "donors"]        subrecurso público
 *   ["/api/campaigns", 5, "transparency"] transparencia (clave compuesta)
 *   ["/api/admin/campaigns", 5, "expenses"]  subrecurso administrativo
 */

export const CAMPAIGNS_KEY = "/api/campaigns";
export const ADMIN_CAMPAIGNS_KEY = "/api/admin/campaigns";
export const DONATIONS_KEY = "/api/donations";
export const ADMIN_DONATIONS_KEY = "/api/admin/donations";
export const ALLIES_KEY = "/api/allies";
export const ADMIN_ALLIES_KEY = "/api/admin/allies";
export const SETTINGS_KEY = "settings";
export const ADMIN_SETTINGS_KEY = "admin-settings";
// V14-3.1: pares admin/público que faltaban. Sin ellos, el panel invalidaba una entrada
// de caché y la web pública leía otra distinta: el cambio no se reflejaba.
export const PETS_KEY = "/api/pets";
export const ADMIN_PETS_KEY = "/api/admin/pets";
export const NEWS_KEY = "/api/news";
export const ADMIN_REPORTS_KEY = "/api/admin/reports";
export const REPORTS_KEY = "/api/reports";
export const FAQ_KEY = "/api/faq";
export const ADMIN_FAQ_KEY = "/api/admin/faq";
export const TESTIMONIALS_KEY = "/api/testimonials";
export const ADMIN_TESTIMONIALS_KEY = "/api/admin/testimonials";

/**
 * `true` si la primera parte de la clave es `prefix` o un recurso colgante de
 * él (`prefix/5`, `prefix/5/donors`). `prefix` nunca termina en `/`.
 */
function headIs(key: readonly unknown[], prefix: string): boolean {
  const head = key[0];
  return (
    typeof head === "string" &&
    (head === prefix || head.startsWith(`${prefix}/`))
  );
}

/** Campañas: lista, detalle, subrecursos públicos y administrativos. */
export function isCampaignQueryKey(key: readonly unknown[]): boolean {
  return (
    headIs(key, CAMPAIGNS_KEY) || headIs(key, ADMIN_CAMPAIGNS_KEY)
  );
}

/** Donaciones: listado, estadísticas, comprobantes y duplicados. */
export function isDonationQueryKey(key: readonly unknown[]): boolean {
  return (
    headIs(key, DONATIONS_KEY) || headIs(key, ADMIN_DONATIONS_KEY)
  );
}

/** Aliados/empresas: listado público y administrativo. */
export function isAllyQueryKey(key: readonly unknown[]): boolean {
  return headIs(key, ALLIES_KEY) || headIs(key, ADMIN_ALLIES_KEY);
}

/** Configuración: `settings` (pública) y `admin-settings` (panel). */
export function isSettingsQueryKey(key: readonly unknown[]): boolean {
  return key[0] === SETTINGS_KEY || key[0] === ADMIN_SETTINGS_KEY;
}

/**
 * `true` si la clave pertenece a alguna de las entidades indicadas. Se usa para
 * invalidar «todo lo que depende de X» sin repetir predicados por el código.
 */
export type QueryEntity =
  | "campaigns"
  | "donations"
  | "allies"
  | "settings";

const ENTITY_PREDICATES: Record<
  QueryEntity,
  (key: readonly unknown[]) => boolean
> = {
  campaigns: isCampaignQueryKey,
  donations: isDonationQueryKey,
  allies: isAllyQueryKey,
  settings: isSettingsQueryKey,
};

export function isEntityQueryKey(
  key: readonly unknown[],
  entities: readonly QueryEntity[],
): boolean {
  return entities.some((entity) => ENTITY_PREDICATES[entity](key));
}

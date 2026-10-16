import type { QueryClient } from "@tanstack/react-query";
import { isEntityQueryKey, type QueryEntity } from "@/lib/query-keys";

/**
 * Invalidación de caché por ENTIDAD (Prompt Maestro, Fase 1 — sincronización).
 *
 * Regla del proyecto: cada entidad tiene UNA fuente de verdad en la API y el
 * panel invalida por entidad, no por clave concreta. Así una mutación del
 * administrador refresca a la vez el listado, el detalle, los subrecursos
 * públicos y los administrativos, sin depender de recordar cada `queryKey`.
 *
 * Por qué un predicado y no `queryKey: [prefijo]`: TanStack Query invalida por
 * prefijo sobre los ELEMENTOS de la clave, y el cliente generado por Orval usa
 * claves de un solo string para el detalle (`["/api/campaigns/5"]`), que no son
 * prefijo de `["/api/campaigns"]`. Los predicados viven en `lib/query-keys.ts`
 * (puros y probados con node:test).
 */
export function invalidateEntities(
  queryClient: QueryClient,
  entities: readonly QueryEntity[],
): void {
  void queryClient.invalidateQueries({
    predicate: (query) =>
      Array.isArray(query.queryKey) &&
      isEntityQueryKey(query.queryKey, entities),
  });
}

/**
 * Campañas + configuración: el ciclo de vida, el contenido de la campaña, su
 * transparencia y la campaña protagonista de la portada.
 */
export function invalidateCampaignQueries(queryClient: QueryClient): void {
  invalidateEntities(queryClient, ["campaigns", "settings"]);
}

/**
 * Donaciones + campañas: aprobar o rechazar una donación cambia el monto
 * recaudado y el panel de transparencia público, no solo el listado de
 * donaciones.
 */
export function invalidateDonationQueries(queryClient: QueryClient): void {
  invalidateEntities(queryClient, ["donations", "campaigns"]);
}

/** Aliados: la página pública y el panel administrativo comparten entidad. */
export function invalidateAllyQueries(queryClient: QueryClient): void {
  invalidateEntities(queryClient, ["allies"]);
}

// ─── V15: invalidación de las entidades que faltaban ─────────────────────────
// Cada función refresca a la vez el listado, el detalle y la vista pública de la
// entidad, para que una mutación del panel se refleje sin recargar la página.

/** Mascotas y solicitudes de adopción (panel + web pública). */
export function invalidatePetQueries(queryClient: QueryClient): void {
  invalidateEntities(queryClient, ["pets"]);
}

/** Noticias: listado público, detalle y panel administrativo. */
export function invalidateNewsQueries(queryClient: QueryClient): void {
  invalidateEntities(queryClient, ["news"]);
}

/** Testimonios: página pública y panel. */
export function invalidateTestimonialQueries(queryClient: QueryClient): void {
  invalidateEntities(queryClient, ["testimonials"]);
}

/** Preguntas frecuentes: página pública y panel. */
export function invalidateFaqQueries(queryClient: QueryClient): void {
  invalidateEntities(queryClient, ["faq"]);
}

/** Reportes ciudadanos: listado del panel y detalle. */
export function invalidateReportQueries(queryClient: QueryClient): void {
  invalidateEntities(queryClient, ["reports"]);
}

/**
 * Identidad institucional: el contenido publicado que consume la web y la
 * configuración que lo acompaña (la portada y el logotipo también viven en la
 * entidad `settings` en algunas vistas).
 */
export function invalidateIdentityQueries(queryClient: QueryClient): void {
  invalidateEntities(queryClient, ["identity", "settings"]);
}

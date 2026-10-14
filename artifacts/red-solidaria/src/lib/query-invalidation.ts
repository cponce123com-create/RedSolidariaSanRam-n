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

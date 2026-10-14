import { useQuery } from "@tanstack/react-query";

/**
 * Configuración pública (`GET /api/settings`).
 *
 * Comparte la clave de caché `["settings"]` con el resto del panel, de modo que
 * el protagonista de la portada y los datos del evento ChocoFest se resuelven
 * con una sola consulta y se mantienen sincronizados entre componentes.
 */
export function usePublicSettings() {
  return useQuery<Record<string, string>>({
    queryKey: ["settings"],
    queryFn: async () => {
      const res = await fetch("/api/settings");
      if (!res.ok) throw new Error("settings");
      return (await res.json()) as Record<string, string>;
    },
    staleTime: 60 * 1000,
  });
}

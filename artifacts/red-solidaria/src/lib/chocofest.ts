/**
 * Configuración de la campaña ChocoFest 2026.
 *
 * IMPORTANTE (Prompt Maestro, Fase 3): el lema, las fechas y las metas oficiales
 * NO están definidos todavía. Los valores marcados como PROVISIONAL son textos
 * de trabajo editables desde el panel de administración (campañas); **no**
 * representan cifras, fechas ni compromisos reales.
 *
 * La campaña real se crea/gestiona desde el admin (tabla `campaigns`); esta
 * página la resuelve por título y muestra un estado "en preparación" si aún no
 * existe, para que la URL permanente funcione desde ya.
 */

export const CHOCOFEST_2026 = {
  /** Título con el que se identifica la campaña en la BD. */
  campaignTitle: "ChocoFest 2026",
  slug: "chocofest-2026",
  year: 2026,
  organizer: "Red Solidaria San Ramón",
  location: "San Ramón, Chanchamayo, Junín, Perú",
  /** PROVISIONAL — lema de trabajo (editable desde el admin). */
  provisionalMotto: "Una Navidad para compartir alegría",
} as const;

/** Ruta pública permanente de la campaña. */
export const CHOCOFEST_2026_PATH = "/campanas/chocofest-2026";

interface CampaignLike {
  title?: string | null;
  startDate?: string | null;
}

/**
 * Encuentra la campaña ChocoFest 2026 dentro de una lista de campañas públicas.
 * Coincidencia exacta por título; si no, heurística por "chocofest" + "2026".
 * Función pura y testeable.
 */
export function findChocofest2026<T extends CampaignLike>(
  campaigns: readonly T[] | undefined | null,
): T | undefined {
  if (!campaigns || campaigns.length === 0) return undefined;

  const target = CHOCOFEST_2026.campaignTitle.trim().toLowerCase();
  const exact = campaigns.find(
    (c) => (c.title ?? "").trim().toLowerCase() === target,
  );
  if (exact) return exact;

  return campaigns.find((c) => {
    const t = (c.title ?? "").toLowerCase();
    return t.includes("chocofest") && t.includes(String(CHOCOFEST_2026.year));
  });
}

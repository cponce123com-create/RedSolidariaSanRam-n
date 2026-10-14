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
 * Clave de `settings` que guarda el **id** de la campaña protagonista de la
 * portada. Es un identificador ESTABLE (id numérico), no una coincidencia de
 * título: renombrar la campaña no rompe el protagonismo.
 *
 * Un único valor ⇒ solo puede haber una campaña protagonista a la vez.
 */
export const PROTAGONIST_SETTING_KEY = "protagonist_campaign_id";

/**
 * Convierte el valor de `settings` en un id utilizable.
 * Devuelve `null` si está vacío, no es un entero o es <= 0; en ese caso la
 * portada general se mantiene.
 */
export function parseProtagonistId(
  value: string | number | null | undefined,
): number | null {
  if (value === null || value === undefined) return null;
  const raw = typeof value === "number" ? String(value) : value.trim();
  if (raw === "") return null;
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) return null;
  return id;
}

interface ProtagonistCandidate {
  status?: string | null;
  endDate?: string | null;
}

/**
 * Decide si una campaña puede ocupar el bloque protagonista de la portada.
 *
 * Devuelve `null` (⇒ se restaura la portada general) cuando:
 *  - la campaña no existe o no se ha publicado;
 *  - su estado no es `active`;
 *  - ya terminó (fecha de fin anterior a hoy).
 *
 * Función pura: la fecha de referencia se inyecta para poder testearla.
 */
export function resolveProtagonist<T extends ProtagonistCandidate>(
  campaign: T | undefined | null,
  today: Date,
): T | null {
  if (!campaign) return null;
  if ((campaign.status ?? "") !== "active") return null;

  const end = campaign.endDate;
  if (end) {
    const endDay = String(end).slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(endDay) && endDay < today.toISOString().slice(0, 10)) {
      return null;
    }
  }
  return campaign;
}

/** Mueve la campaña protagonista al primer lugar sin duplicar ni perder ninguna. */
export function prioritizeCampaign<T extends { id?: number | null }>(
  campaigns: readonly T[],
  protagonistId: number | null,
): T[] {
  if (protagonistId === null) return [...campaigns];
  const protagonist = campaigns.find((c) => c.id === protagonistId);
  if (!protagonist) return [...campaigns];
  return [protagonist, ...campaigns.filter((c) => c.id !== protagonistId)];
}

/** Quita la campaña protagonista de una lista (evita repetirla en la portada). */
export function excludeCampaign<T extends { id?: number | null }>(
  campaigns: readonly T[],
  protagonistId: number | null,
): T[] {
  if (protagonistId === null) return [...campaigns];
  return campaigns.filter((c) => c.id !== protagonistId);
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

/**
 * Claves de `settings` (grupo "chocofest") con los datos del evento que el
 * administrador puede editar y que se muestran en la página pública.
 * No requieren migración: `settings` es una tabla clave-valor genérica.
 */
export const CHOCOFEST_SETTING_KEYS = {
  place: "chocofest_2026_place",
  schedule: "chocofest_2026_schedule",
  motto: "chocofest_2026_motto",
} as const;

export interface ChocofestEventDetails {
  place: string;
  schedule: string;
  motto: string;
}

/**
 * Resuelve los datos del evento a partir de `settings`, con los textos de
 * trabajo como respaldo cuando aún no se han configurado. Función pura y
 * testeable (nunca inventa datos: solo usa lo guardado o el respaldo marcado
 * como provisional).
 */
export function resolveEventDetails(
  settings: Record<string, string> | undefined | null,
): ChocofestEventDetails {
  const pick = (key: string, fallback: string): string => {
    const raw = settings?.[key];
    const value = typeof raw === "string" ? raw.trim() : "";
    return value || fallback;
  };
  return {
    place: pick(CHOCOFEST_SETTING_KEYS.place, CHOCOFEST_2026.location),
    schedule: pick(CHOCOFEST_SETTING_KEYS.schedule, ""),
    motto: pick(CHOCOFEST_SETTING_KEYS.motto, CHOCOFEST_2026.provisionalMotto),
  };
}

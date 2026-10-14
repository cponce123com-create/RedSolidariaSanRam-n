/**
 * Configuración de la campaña ChocoFest 2026.
 *
 * IMPORTANTE (Prompt Maestro, Fase 3): el lema, las fechas y las metas oficiales
 * NO están definidos todavía. Los valores marcados como PROVISIONAL son textos
 * de trabajo editables desde el panel de administración; **no** representan
 * cifras, fechas ni compromisos reales.
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
 *
 * Toda clave nueva debe añadirse TAMBIÉN a la allowlist pública del API
 * (`artifacts/api-server/src/lib/public-settings.ts`); por defecto es privada.
 */
export const CHOCOFEST_SETTING_KEYS = {
  place: "chocofest_2026_place",
  schedule: "chocofest_2026_schedule",
  motto: "chocofest_2026_motto",
  objectives: "chocofest_2026_objectives",
  organizers: "chocofest_2026_organizers",
} as const;

export interface ChocofestEventDetails {
  place: string;
  schedule: string;
  motto: string;
  /** Objetivos del evento (texto libre; vacío si no se han definido). */
  objectives: string;
  /** Equipo responsable que se muestra al público. */
  organizers: string;
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
    objectives: pick(CHOCOFEST_SETTING_KEYS.objectives, ""),
    organizers: pick(CHOCOFEST_SETTING_KEYS.organizers, CHOCOFEST_2026.organizer),
  };
}

// ─── Estado de organización del evento (Fase 2.1) ────────────────────────────

/** Estados en los que la campaña ya es visible al público. */
const VISIBLE_STATUSES = ["active", "paused"] as const;

export interface EventReadinessInput {
  /** Datos mínimos de la campaña (puede ser null si aún no existe). */
  campaign:
    | {
        description?: string | null;
        goal?: number | null;
        status?: string | null;
        startDate?: string | null;
        imageUrl?: string | null;
      }
    | null
    | undefined;
  /** La campaña está configurada como protagonista de la portada. */
  isProtagonist: boolean;
  donationCount: number;
  imageCount: number;
  updateCount: number;
  expenseCount: number;
  budgetCount: number;
  itemCount: number;
}

export interface ReadinessCheck {
  /** Clave estable para la etiqueta (i18n) y para los tests. */
  key: string;
  ok: boolean;
}

export interface EventReadiness {
  checks: ReadinessCheck[];
  done: number;
  total: number;
  percent: number;
  /** `true` solo cuando TODOS los puntos están cumplidos. */
  ready: boolean;
}

/**
 * Calcula el estado de organización con DATOS REALES.
 *
 * Antes el panel mostraba un punto del checklist fijado en `false` («cronograma»)
 * aunque el evento sí tuviera novedades publicadas: un dato inventado que no
 * cambiaba nunca. Ahora cada punto se deriva de lo que existe en la base de
 * datos, así que el semáforo refleja la realidad y sirve para saber qué falta.
 *
 * Función pura y testeable: recibe solo contadores y campos.
 */
export function eventReadiness(input: EventReadinessInput): EventReadiness {
  const campaign = input.campaign ?? null;
  const text = (value: string | null | undefined): string =>
    typeof value === "string" ? value.trim() : "";
  const positive = (value: number | null | undefined): boolean =>
    typeof value === "number" && Number.isFinite(value) && value > 0;

  const checks: ReadinessCheck[] = [
    {
      key: "published",
      ok: (VISIBLE_STATUSES as readonly string[]).includes(campaign?.status ?? ""),
    },
    { key: "protagonist", ok: input.isProtagonist },
    { key: "presentation", ok: text(campaign?.description).length > 0 },
    { key: "goal", ok: positive(campaign?.goal) },
    { key: "dates", ok: text(campaign?.startDate).length > 0 },
    { key: "cover", ok: text(campaign?.imageUrl).length > 0 },
    { key: "donations", ok: positive(input.donationCount) },
    { key: "gallery", ok: positive(input.imageCount) },
    { key: "timeline", ok: positive(input.updateCount) },
    { key: "transparency", ok: positive(input.expenseCount) },
    { key: "budget", ok: positive(input.budgetCount) },
    { key: "inventory", ok: positive(input.itemCount) },
  ];

  const done = checks.filter((c) => c.ok).length;
  const total = checks.length;
  return {
    checks,
    done,
    total,
    percent: total > 0 ? Math.round((done / total) * 100) : 0,
    ready: done === total,
  };
}

// ─── Programa de actividades con responsables (Fase 2.1) ─────────────────────

/**
 * Clave de `settings` con el programa del evento.
 *
 * Se guarda como TEXTO (una actividad por línea) y no como tabla nueva: el
 * programa es un dato de presentación corto y ordenado, y `settings` ya es la
 * fuente de verdad de la información del evento. La estructura se valida al
 * leerla con `parseProgram`, así que un texto mal escrito nunca rompe la página.
 *
 * Formato de cada línea:  `hora | título | responsable`
 *   - La hora y el responsable son opcionales.
 *   - Las líneas vacías y las que empiezan por `#` se ignoran (comentarios).
 */
export const CHOCOFEST_PROGRAM_SETTING_KEY = "chocofest_2026_program";

export interface ProgramActivity {
  /** Hora o momento ("16:00", "4:00 p.m."). Vacío si no se indicó. */
  time: string;
  /** Actividad (obligatoria: sin título la línea se descarta). */
  title: string;
  /** Responsable o equipo. Vacío si no se indicó. */
  responsible: string;
}

const MAX_ACTIVITIES = 40;
const MAX_TIME = 20;
const MAX_TITLE = 120;
const MAX_RESPONSIBLE = 80;

function clean(value: string, max: number): string {
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

/**
 * Convierte el texto guardado en una lista de actividades.
 *
 * Tolerante a propósito: nunca lanza. Las líneas incompletas se interpretan de
 * la forma más razonable (una línea con solo texto es una actividad sin hora) y
 * las líneas sin título se descartan en lugar de mostrar filas vacías.
 */
export function parseProgram(
  raw: string | null | undefined,
): ProgramActivity[] {
  if (typeof raw !== "string" || !raw.trim()) return [];

  const activities: ProgramActivity[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const [first = "", second = "", ...rest] = trimmed.split("|");
    // Con una sola parte no hay hora: el texto es la actividad.
    const hasTime = trimmed.includes("|");
    const time = hasTime ? clean(first, MAX_TIME) : "";
    const title = clean(hasTime ? second : first, MAX_TITLE);
    if (!title) continue;

    activities.push({
      time,
      title,
      responsible: clean(rest.join(" "), MAX_RESPONSIBLE),
    });
    if (activities.length >= MAX_ACTIVITIES) break;
  }
  return activities;
}

/** Vuelve a texto lo que edita el panel (una línea por actividad). */
export function serializeProgram(
  activities: readonly ProgramActivity[] | undefined | null,
): string {
  return (activities ?? [])
    .map((activity) => {
      const parts = [clean(activity.time, MAX_TIME), clean(activity.title, MAX_TITLE)];
      const responsible = clean(activity.responsible, MAX_RESPONSIBLE);
      if (responsible) parts.push(responsible);
      return parts.filter(Boolean).join(" | ");
    })
    .filter(Boolean)
    .join("\n");
}

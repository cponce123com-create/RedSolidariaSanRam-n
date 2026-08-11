// Utilidades puras para el "modo emergencia" (Fase 3 del rediseño):
// detección de campañas activas con fecha de cierre próxima y descomposición
// del countdown. Sin dependencias de React: 100% testeable con node:test.

export const URGENCY_THRESHOLD_DAYS = 7;

const DAY_MS = 86_400_000;

/**
 * Días (redondeados hacia arriba) que faltan para `endDate`.
 * Devuelve `null` si no hay fecha de cierre o si no es parseable.
 * Un `endDate` ya pasado devuelve un número negativo (el llamador decide
 * si eso cuenta como urgente).
 */
export function daysUntilEnd(
  endDate?: string | null,
  now: number = Date.now(),
): number | null {
  if (!endDate) return null;
  const end = new Date(endDate).getTime();
  if (Number.isNaN(end)) return null;
  return Math.ceil((end - now) / DAY_MS);
}

export interface UrgentCampaignLike {
  status: string;
  endDate?: string | null;
}

/**
 * True si la campaña está activa y su fecha de cierre cae dentro del umbral
 * (hoy incluido, `threshold` días como máximo). Nunca es urgente si la fecha
 * ya pasó o no existe.
 */
export function isUrgent(
  campaign: UrgentCampaignLike,
  threshold: number = URGENCY_THRESHOLD_DAYS,
  now: number = Date.now(),
): boolean {
  if (campaign.status !== "active") return false;
  const days = daysUntilEnd(campaign.endDate, now);
  return days !== null && days >= 0 && days <= threshold;
}

export interface CountdownParts {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

/** Descompone una duración (ms) en días/horas/minutos/segundos, con clamp ≥ 0. */
export function formatCountdownParts(ms: number): CountdownParts {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  return {
    days: Math.floor(totalSeconds / 86_400),
    hours: Math.floor((totalSeconds % 86_400) / 3_600),
    minutes: Math.floor((totalSeconds % 3_600) / 60),
    seconds: totalSeconds % 60,
  };
}

/**
 * Devuelve la campaña con la fecha de cierre más próxima (la más urgente)
 * entre las que aún no han pasado. `null` si la lista está vacía o ninguna
 * tiene una fecha de cierre futura. El filtrado por estado activo/umbral lo
 * hace el llamador (p.ej. `campaigns.filter(isUrgent)`).
 */
export function mostUrgentCampaign<T extends UrgentCampaignLike>(
  campaigns: T[],
  now: number = Date.now(),
): T | null {
  let best: T | null = null;
  let bestDays = Infinity;
  for (const campaign of campaigns) {
    const days = daysUntilEnd(campaign.endDate, now);
    if (days === null || days < 0) continue;
    if (days < bestDays) {
      bestDays = days;
      best = campaign;
    }
  }
  return best;
}

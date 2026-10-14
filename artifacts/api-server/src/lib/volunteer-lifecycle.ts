/**
 * Ciclo de vida del voluntariado (Fase 5 del Prompt Maestro).
 *
 * El registro es PERMANENTE: un mismo correo no genera fichas duplicadas y la
 * decisión (aprobación o descarte) queda trazada con quién y cuándo. Ninguna
 * decisión sobre una persona es silenciosa.
 *
 * Funciones PURAS y testeables.
 */

export const VOLUNTEER_STATUSES = [
  "pending",
  "reviewing",
  "approved",
  "contacted",
  "rejected",
] as const;

export type VolunteerStatus = (typeof VOLUNTEER_STATUSES)[number];

export const VOLUNTEER_STATUS_LABEL: Record<VolunteerStatus, string> = {
  pending: "Pendiente",
  reviewing: "En revisión",
  approved: "Aprobado",
  contacted: "Contactado",
  rejected: "No procede",
};

export function volunteerStatusLabel(status: string): string {
  return VOLUNTEER_STATUS_LABEL[status as VolunteerStatus] ?? status;
}

export function isVolunteerStatus(value: unknown): value is VolunteerStatus {
  return (
    typeof value === "string" &&
    (VOLUNTEER_STATUSES as readonly string[]).includes(value)
  );
}

/**
 * Transiciones válidas. Cubren el flujo real del panel: pasar a «en revisión»,
 * aprobar desde pendiente/revisión/contactado, marcar como contactado y
 * descartar (o reabrir un descarte).
 */
const TRANSITIONS: Record<VolunteerStatus, readonly VolunteerStatus[]> = {
  pending: ["reviewing", "approved", "rejected"],
  reviewing: ["approved", "rejected"],
  approved: ["contacted", "rejected"],
  contacted: ["approved", "rejected"],
  rejected: ["pending"],
};

export function allowedTransitions(from: string): readonly VolunteerStatus[] {
  return isVolunteerStatus(from) ? TRANSITIONS[from] : [];
}

export function canTransition(from: string, to: string): boolean {
  if (!isVolunteerStatus(from) || !isVolunteerStatus(to)) return false;
  if (from === to) return false;
  return TRANSITIONS[from].includes(to);
}

/** Mensaje accionable cuando la transición no es válida. */
export function transitionError(from: string, to: string): string {
  if (from === to) {
    return `La postulación ya está en estado «${volunteerStatusLabel(from)}».`;
  }
  if (!isVolunteerStatus(from) || !isVolunteerStatus(to)) {
    return "Estado de postulación no válido.";
  }
  const allowed = TRANSITIONS[from].map(volunteerStatusLabel).join(", ");
  return `No se puede pasar de «${volunteerStatusLabel(from)}» a «${volunteerStatusLabel(to)}». Estados permitidos: ${allowed}.`;
}

/** ¿El estado representa una decisión tomada? (aprobado o descartado) */
export function isDecidedStatus(status: string): boolean {
  return status === "approved" || status === "rejected";
}

/** ¿Este estado exige registrar quién decidió y cuándo? */
export function requiresDecisionTrace(status: string): boolean {
  return status === "approved" || status === "rejected";
}

/** Normaliza un correo para comparar identidades (trim + minúsculas). */
export function normalizeVolunteerEmail(email: unknown): string {
  return typeof email === "string" ? email.trim().toLowerCase() : "";
}

/** ¿Es un correo con forma válida? (validación de forma, no de existencia) */
export function isValidVolunteerEmail(email: string): boolean {
  if (!email || email.length > 254) return false;
  const at = email.indexOf("@");
  if (at <= 0 || at !== email.lastIndexOf("@")) return false;
  const domain = email.slice(at + 1);
  return domain.includes(".") && !domain.startsWith(".") && !domain.endsWith(".");
}

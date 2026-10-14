import { ROLES } from "../middleware/roles";

/**
 * Supervisión (Fase 4 del Prompt Maestro).
 *
 * El supervisor es un rol de SOLO CONSULTA: revisa donaciones, informes y
 * auditoría, y puede dejar OBSERVACIONES. No modifica dinero ni configuración.
 * La observación es un anexo trazable; NUNCA altera el registro observado.
 *
 * Funciones PURAS y testeables.
 */

export const OBSERVATION_ENTITY_TYPES = {
  donation: "donation",
  campaign: "campaign",
  movement: "movement",
  donor: "donor",
} as const;

export type ObservationEntityType =
  (typeof OBSERVATION_ENTITY_TYPES)[keyof typeof OBSERVATION_ENTITY_TYPES];

export const OBSERVATION_MIN_LENGTH = 5;
export const OBSERVATION_MAX_LENGTH = 2000;

export function isObservationEntityType(
  value: unknown,
): value is ObservationEntityType {
  return (
    typeof value === "string" &&
    (Object.values(OBSERVATION_ENTITY_TYPES) as readonly string[]).includes(value)
  );
}

const ENTITY_TYPE_LABEL: Record<string, string> = {
  donation: "Donación",
  campaign: "Campaña",
  movement: "Movimiento contable",
  donor: "Donante",
};

export function observationEntityLabel(type: string): string {
  return ENTITY_TYPE_LABEL[type] ?? type;
}

export interface ObservationInput {
  entityType: unknown;
  entityId: unknown;
  body: unknown;
}

export type ObservationValidation =
  | {
      ok: true;
      value: { entityType: ObservationEntityType; entityId: string; body: string };
    }
  | { ok: false; message: string };

/** Valida y normaliza una observación; devuelve un mensaje accionable en fallo. */
export function validateObservation(input: ObservationInput): ObservationValidation {
  if (!isObservationEntityType(input.entityType)) {
    return { ok: false, message: "Tipo de registro no válido." };
  }
  const entityId = String(input.entityId ?? "").trim();
  if (!entityId || entityId.length > 40) {
    return { ok: false, message: "El registro observado no es válido." };
  }
  const body = String(input.body ?? "").trim();
  if (body.length < OBSERVATION_MIN_LENGTH) {
    return {
      ok: false,
      message: `La observación debe tener al menos ${OBSERVATION_MIN_LENGTH} caracteres.`,
    };
  }
  if (body.length > OBSERVATION_MAX_LENGTH) {
    return {
      ok: false,
      message: `La observación no puede superar ${OBSERVATION_MAX_LENGTH} caracteres.`,
    };
  }
  return { ok: true, value: { entityType: input.entityType, entityId, body } };
}

/** ¿El rol puede DEJAR observaciones? (administración y supervisión) */
export function canWriteObservation(role: string | null | undefined): boolean {
  return (
    role === ROLES.SUPERADMIN ||
    role === ROLES.ADMIN ||
    role === ROLES.SUPERVISOR
  );
}

/** ¿El rol puede RESOLVER observaciones? (solo administración) */
export function canResolveObservation(role: string | null | undefined): boolean {
  return role === ROLES.SUPERADMIN || role === ROLES.ADMIN;
}

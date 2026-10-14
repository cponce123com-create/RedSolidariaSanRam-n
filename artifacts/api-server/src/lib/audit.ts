/**
 * Registro de auditoría (Fase 4 del Prompt Maestro).
 *
 * Toda acción administrativa sensible queda registrada con QUIÉN, QUÉ, CUÁNDO y
 * SOBRE QUÉ. Ninguna corrección contable es silenciosa: la aprobación, el
 * rechazo y la conciliación de una donación, y el ciclo de vida de una campaña
 * quedan trazados y son consultables desde el panel.
 *
 * Funciones PURAS y testeables (sin DB).
 */

export const AUDIT_ACTIONS = {
  donationApproved: "DONATION_APPROVED",
  donationRejected: "DONATION_REJECTED",
  donationStatusChanged: "DONATION_STATUS_CHANGED",
  donationReconciled: "DONATION_RECONCILED",
  campaignStatusChanged: "CAMPAIGN_STATUS_CHANGED",
  campaignDeleted: "CAMPAIGN_DELETED",
  campaignTestPurged: "CAMPAIGN_TEST_PURGED",
  campaignReportsUnlinked: "CAMPAIGN_REPORTS_UNLINKED",
  donorCreated: "DONOR_CREATED",
  donorUpdated: "DONOR_UPDATED",
  observationCreated: "OBSERVATION_CREATED",
  observationResolved: "OBSERVATION_RESOLVED",
  volunteerStatusChanged: "VOLUNTEER_STATUS_CHANGED",
  volunteerApproved: "VOLUNTEER_APPROVED",
  volunteerRejected: "VOLUNTEER_REJECTED",
  volunteerTeamAssigned: "VOLUNTEER_TEAM_ASSIGNED",
  volunteerTeamLeft: "VOLUNTEER_TEAM_LEFT",
  volunteerParticipationRecorded: "VOLUNTEER_PARTICIPATION_RECORDED",
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

export const AUDIT_RESOURCES = {
  donations: "donations",
  campaigns: "campaigns",
  donors: "donors",
  observations: "observations",
  volunteers: "volunteers",
} as const;

const ACTION_LABEL: Record<string, string> = {
  [AUDIT_ACTIONS.donationApproved]: "Donación aprobada",
  [AUDIT_ACTIONS.donationRejected]: "Donación rechazada",
  [AUDIT_ACTIONS.donationStatusChanged]: "Estado de donación cambiado",
  [AUDIT_ACTIONS.donationReconciled]: "Donación conciliada con el banco",
  [AUDIT_ACTIONS.campaignStatusChanged]: "Estado de campaña cambiado",
  [AUDIT_ACTIONS.campaignDeleted]: "Borrador de campaña eliminado",
  [AUDIT_ACTIONS.campaignTestPurged]: "Datos de prueba de campaña purgados",
  [AUDIT_ACTIONS.campaignReportsUnlinked]: "Reportes ciudadanos desvinculados de la campaña",
  [AUDIT_ACTIONS.donorCreated]: "Donante creado",
  [AUDIT_ACTIONS.donorUpdated]: "Donante actualizado",
  [AUDIT_ACTIONS.observationCreated]: "Observación de supervisión registrada",
  [AUDIT_ACTIONS.observationResolved]: "Observación de supervisión atendida",
  [AUDIT_ACTIONS.volunteerStatusChanged]: "Estado de postulación cambiado",
  [AUDIT_ACTIONS.volunteerApproved]: "Voluntario aprobado",
  [AUDIT_ACTIONS.volunteerRejected]: "Postulación descartada",
  [AUDIT_ACTIONS.volunteerTeamAssigned]: "Voluntario asignado a un equipo",
  [AUDIT_ACTIONS.volunteerTeamLeft]: "Voluntario retirado de un equipo",
  [AUDIT_ACTIONS.volunteerParticipationRecorded]: "Participación registrada",
};

export function auditActionLabel(action: string): string {
  return ACTION_LABEL[action] ?? action;
}

export function isAuditAction(value: unknown): value is AuditAction {
  return (
    typeof value === "string" &&
    (Object.values(AUDIT_ACTIONS) as readonly string[]).includes(value)
  );
}

/**
 * Claves cuyo valor NUNCA debe mostrarse. Se aplica al LEER el registro
 * (defensa en profundidad: los `details` ya se sanean al escribir).
 */
const SENSITIVE_KEY_PATTERN =
  /pass|token|secret|clave|cvv|card|authorization|cookie/i;

const MAX_REDACT_DEPTH = 6;

/** Redacta recursivamente las claves sensibles de un valor arbitrario. */
export function redactSensitiveDetails(value: unknown, depth = 0): unknown {
  if (depth > MAX_REDACT_DEPTH) return "[…]";
  if (Array.isArray(value)) {
    return value.map((item) => redactSensitiveDetails(item, depth + 1));
  }
  if (value && typeof value === "object") {
    const source = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(source)) {
      out[key] = SENSITIVE_KEY_PATTERN.test(key)
        ? "[REDACTED]"
        : redactSensitiveDetails(item, depth + 1);
    }
    return out;
  }
  return value;
}

export interface AuditActorSource {
  session?: {
    adminUser?: { id?: number | null; username?: string | null } | null;
  } | null;
  ip?: string | null;
  connection?: { remoteAddress?: string | null } | null;
  get?: (name: string) => string | undefined;
}

export interface AuditContext {
  userId: number | null;
  username: string | null;
  ipAddress: string | null;
  userAgent: string | null;
}

/**
 * Extrae el actor y el origen de la petición para el registro de auditoría.
 * Tolerante a objetos parciales (tests con `req` mínimo).
 */
export function auditContext(req: AuditActorSource): AuditContext {
  const admin = req.session?.adminUser ?? null;
  const userAgent =
    typeof req.get === "function" ? (req.get("user-agent") ?? null) : null;
  return {
    userId: admin?.id ?? null,
    username: admin?.username ?? null,
    ipAddress: req.ip ?? req.connection?.remoteAddress ?? null,
    userAgent,
  };
}

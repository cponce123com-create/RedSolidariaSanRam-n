/**
 * Consentimiento del donante para el reconocimiento público (Fase 4 · V7.1).
 *
 * Funciones PURAS y testeables (sin Express ni base de datos). Deciden, a partir
 * del HISTORIAL de decisiones, qué se puede publicar de un donante.
 *
 * Principios:
 *  1. **La negativa gana.** Revocar un consentimiento lo oculta en las vistas
 *     públicas, pero NO destruye ningún registro contable: el historial de
 *     decisiones se conserva y solo se proyecta el estado vigente.
 *  2. **Sin consentimiento explícito, rige lo declarado al donar.** Si el
 *     donante marcó «anónimo», no se publica su nombre aunque no haya una
 *     decisión registrada. Una decisión explícita de OTORGAR tampoco revela un
 *     nombre declarado como anónimo: se evita publicar lo que nunca se autorizó.
 *  3. **Todo queda versionado.** Cada decisión guarda la versión del texto
 *     aceptado, para poder demostrar QUÉ se aceptó y CUÁNDO.
 */

export const CONSENT_SCOPES = ["public_name", "public_proof", "public_photo"] as const;
export type ConsentScope = (typeof CONSENT_SCOPES)[number];

/** Versión del texto de consentimiento que se registra por defecto. */
export const CONSENT_VERSION = "2026-10-v1";

export const CONSENT_SCOPE_LABEL: Record<ConsentScope, string> = {
  public_name: "Publicar el nombre del donante",
  public_proof: "Publicar la imagen del comprobante",
  public_photo: "Autorizar el uso de fotografías en reconocimientos",
};

export function isConsentScope(value: unknown): value is ConsentScope {
  return typeof value === "string" && (CONSENT_SCOPES as readonly string[]).includes(value);
}

export function consentScopeLabel(scope: string): string {
  return isConsentScope(scope) ? CONSENT_SCOPE_LABEL[scope] : scope;
}

export interface ConsentDecision {
  scope: string;
  granted: boolean;
  version?: string | null;
  reason?: string | null;
  recordedBy?: string | null;
  createdAt: Date | string;
}

export type ConsentMap = Partial<Record<ConsentScope, boolean>>;

function toTime(value: Date | string): number {
  const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

/**
 * Estado vigente por alcance: la ÚLTIMA decisión de cada uno. Ante empate de
 * fecha gana la que aparece más tarde en el arreglo (inserción posterior), que
 * es como llegan las filas desde la base (`order by created_at, id`).
 */
export function latestConsentMap(
  rows: readonly ConsentDecision[],
): ConsentMap {
  const ordered = [...rows].sort((a, b) => toTime(a.createdAt) - toTime(b.createdAt));
  const map: ConsentMap = {};
  for (const row of ordered) {
    if (isConsentScope(row.scope)) map[row.scope] = row.granted;
  }
  return map;
}

export interface ConsentStateEntry {
  scope: ConsentScope;
  granted: boolean;
  version: string;
  reason: string | null;
  recordedBy: string | null;
  decidedAt: string;
  /** Número total de decisiones registradas para este alcance. */
  decisions: number;
}

/** Estado vigente con su trazabilidad, para el panel administrativo. */
export function consentState(rows: readonly ConsentDecision[]): ConsentStateEntry[] {
  const byScope = new Map<string, ConsentDecision[]>();
  for (const row of rows) {
    if (!isConsentScope(row.scope)) continue;
    const bucket = byScope.get(row.scope);
    if (bucket) bucket.push(row);
    else byScope.set(row.scope, [row]);
  }

  return [...byScope.entries()].map(([scope, decisions]) => {
    const ordered = [...decisions].sort((a, b) => toTime(a.createdAt) - toTime(b.createdAt));
    const latest = ordered[ordered.length - 1];
    return {
      scope: scope as ConsentScope,
      granted: latest.granted,
      version: latest.version ?? CONSENT_VERSION,
      reason: latest.reason ?? null,
      recordedBy: latest.recordedBy ?? null,
      decidedAt: new Date(toTime(latest.createdAt)).toISOString(),
      decisions: ordered.length,
    };
  });
}

export interface PublicRecognitionInput {
  /** El donante marcó «anónimo» al donar. */
  anonymous: boolean;
  /** El donante autorizó publicar el comprobante al donar. */
  publicProof: boolean;
  /** Decisiones explícitas registradas (pueden no existir). */
  consents?: ConsentMap | null;
}

export interface PublicRecognition {
  publishName: boolean;
  publishProof: boolean;
  publishPhoto: boolean;
}

/**
 * Qué se puede publicar de un donante. La negativa siempre gana; el
 * consentimiento explícito nunca revela un nombre declarado como anónimo.
 */
export function resolvePublicRecognition(
  input: PublicRecognitionInput,
): PublicRecognition {
  const consents = input.consents ?? {};
  return {
    publishName: !input.anonymous && consents.public_name !== false,
    publishProof: input.publicProof && consents.public_proof !== false,
    publishPhoto: input.publicProof && consents.public_photo !== false,
  };
}

export type ConsentDecisionCheck =
  | { ok: true; scope: ConsentScope; granted: boolean; version: string; reason: string | null }
  | { ok: false; message: string };

/**
 * Valida una decisión de consentimiento. Revocar (o denegar) exige un MOTIVO:
 * una revocación sin justificación no es trazable.
 */
export function validateConsentDecision(input: {
  scope?: unknown;
  granted?: unknown;
  version?: unknown;
  reason?: unknown;
  minReasonLength?: number;
}): ConsentDecisionCheck {
  if (!isConsentScope(input.scope)) {
    return {
      ok: false,
      message: `Alcance inválido. Permitidos: ${CONSENT_SCOPES.join(", ")}.`,
    };
  }
  if (typeof input.granted !== "boolean") {
    return { ok: false, message: "Indica si el consentimiento se otorga (true) o se revoca (false)." };
  }
  const reason = typeof input.reason === "string" ? input.reason.trim() : "";
  const minLength = input.minReasonLength ?? 5;
  if (!input.granted && reason.length < minLength) {
    return {
      ok: false,
      message: `Indica el motivo de la revocación (al menos ${minLength} caracteres).`,
    };
  }
  const version = typeof input.version === "string" && input.version.trim()
    ? input.version.trim()
    : CONSENT_VERSION;
  return {
    ok: true,
    scope: input.scope,
    granted: input.granted,
    version,
    reason: reason || null,
  };
}

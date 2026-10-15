import { createHash } from "node:crypto";

/**
 * Purga definitiva de campañas DEMO (V7.2).
 *
 * PROBLEMA QUE RESUELVE
 * ---------------------
 * Una campaña de demostración («Adopciones» / «Rescate Animal San Ramón») queda
 * atrapada: tiene donaciones, gastos y asientos de prueba, así que el borrado
 * seguro (Modalidad A) y la purga de borradores (Modalidad C) la rechazan. El
 * superadministrador necesita eliminarla con TODOS sus datos ficticios sin
 * comprometer ninguna campaña real.
 *
 * POR QUÉ NO BASTA CON «EL ADMINISTRADOR DICE QUE ES DEMO»
 * -------------------------------------------------------
 * Este módulo implementa una regla estricta: la marca `is_demo` es condición
 * NECESARIA pero NO SUFICIENTE. El servidor calcula, con datos objetivos, si
 * algún registro asociado puede ser REAL y, en tal caso, BLOQUEA la purga y
 * ofrece archivado o anulación contable:
 *
 *   · donaciones conciliadas con el banco (dinero real confirmado),
 *   · gastos con documento de respaldo (boleta/factura subida),
 *   · bienes con flujo real (recibido/usado) o ligados a donante/evidencia,
 *   · evidencias que sirven de prueba documental de un bien,
 *   · asientos del libro cuyo origen NO es una donación/gasto de la campaña,
 *   · cadena de hashes que no verifica (histórico manipulado o incompleto).
 *
 * PROTECCIÓN DEL LIBRO CONTABLE
 * -----------------------------
 * La cadena de hashes es INDEPENDIENTE por campaña (ver `lib/ledger.ts`), así que
 * eliminar la cadena de una campaña de prueba NO reescribe ni invalida las
 * cadenas de las demás. Antes de borrarla se exige que verifique íntegra, se
 * guarda una COPIA completa de sus asientos y su hash raíz en el respaldo
 * (`campaign_purge_backups`), y el manifiesto documenta cómo reconstruirla y
 * volver a verificar la cadena. Nunca se reescribe un hash histórico en
 * silencio ni se elimina un movimiento real.
 *
 * Todo lo de este módulo son FUNCIONES PURAS: la ruta HTTP
 * (`routes/campaigns.ts`) las usa y los tests las verifican sin tocar la DB.
 */

/** Longitud mínima del motivo escrito (queda en la auditoría y en el respaldo). */
export const MIN_DEMO_REASON = 10;

// ─── Tablas afectadas ────────────────────────────────────────────────────────

/**
 * Tablas que se ELIMINAN, en el ORDEN EXACTO de ejecución.
 *
 * El orden no es estético: las claves foráneas del esquema son `ON DELETE
 * RESTRICT` hacia `campaigns` (migración 023), de modo que cualquier hijo que
 * quede vivo aborta el borrado. Los movimientos del libro van primero porque
 * son los que la FK del libro protege con más celo (y el aviso histórico B-1 del
 * e2e), y la campaña va la última, cuando ya no le queda nada colgando.
 */
export const DEMO_PURGE_DELETABLE_TABLES = [
  { table: "campaign_movements", label: "Movimientos contables de prueba" },
  { table: "donation_consents", label: "Consentimientos de las donaciones" },
  { table: "donation_proofs", label: "Comprobantes de las donaciones" },
  { table: "donations", label: "Donaciones ficticias" },
  { table: "campaign_expenses", label: "Gastos ficticios" },
  { table: "campaign_images", label: "Imágenes exclusivas de la campaña" },
  { table: "campaign_updates", label: "Novedades de la campaña" },
  { table: "campaign_budgets", label: "Partidas de presupuesto" },
  { table: "campaign_evidence", label: "Evidencias de prueba" },
  { table: "campaign_leftovers", label: "Bienes e insumos de referencia" },
  { table: "campaigns", label: "Campaña" },
] as const;

/**
 * Tablas que se DESVINCULAN (se conservan intactas, solo se suelta el vínculo
 * con la campaña). Nunca se borran: reconocen a personas, registran trabajo
 * voluntario o son aportes ciudadanos que deben sobrevivir a la campaña.
 */
export const DEMO_PURGE_UNLINKABLE_TABLES = [
  { table: "community_reports", label: "Reportes ciudadanos" },
  { table: "certificates", label: "Certificados emitidos" },
  { table: "volunteer_participations", label: "Participaciones del voluntariado" },
] as const;

/** Registros que la purga NUNCA toca (se informan para dar transparencia). */
export const DEMO_PURGE_PRESERVED = [
  { table: "donors", label: "Perfiles de donante" },
  { table: "volunteers", label: "Voluntariado y equipos" },
  { table: "news", label: "Noticias generales" },
] as const;

export type DemoPurgeTableKey =
  | (typeof DEMO_PURGE_DELETABLE_TABLES)[number]["table"]
  | (typeof DEMO_PURGE_UNLINKABLE_TABLES)[number]["table"];

/** Recuento por tabla de todo lo que arrastra la campaña. */
export type DemoPurgeCounts = Record<DemoPurgeTableKey, number>;

export const EMPTY_DEMO_PURGE_COUNTS: DemoPurgeCounts = {
  campaign_movements: 0,
  donation_consents: 0,
  donation_proofs: 0,
  donations: 0,
  campaign_expenses: 0,
  campaign_images: 0,
  campaign_updates: 0,
  campaign_budgets: 0,
  campaign_evidence: 0,
  campaign_leftovers: 0,
  campaigns: 0,
  community_reports: 0,
  certificates: 0,
  volunteer_participations: 0,
};

// ─── Tipos del análisis ──────────────────────────────────────────────────────

export interface DemoPurgeCampaign {
  id: number;
  title: string;
  status: string;
  isDemo: boolean;
  demoMarkedAt: string | null;
  demoMarkedBy: string | null;
}

/**
 * Señales OBJETIVAS de datos reales. Cualquier valor > 0 bloquea la purga: no se
 * puede demostrar que el registro sea ficticio, así que se archiva o se anula
 * contablemente en vez de destruirlo.
 */
export interface DemoPurgeRealSignals {
  /** Donaciones con conciliación bancaria (`status = 'reconciled'` o fecha). */
  reconciledDonations: number;
  /** Gastos con documento de respaldo (`receipt_url` no vacío). */
  expensesWithReceipt: number;
  /** Bienes con flujo registrado o ligados a un donante/evidencia. */
  leftoversWithFlow: number;
  /** Evidencias que prueban documentalmente un bien registrado. */
  evidenceLinkedToLeftovers: number;
  /** Certificados vigentes que reconocen a personas (se conservan). */
  issuedCertificates: number;
}

export interface DemoPurgeLedgerState {
  movementCount: number;
  chainVerified: boolean;
  brokenAt: number | null;
  rootHash: string | null;
  /** Asientos cuyo origen no es una donación/gasto de ESTA campaña. */
  foreignSources: Array<{ movementId: number; sourceType: string; sourceId: number }>;
}

export interface DemoPurgeIssue {
  code: string;
  message: string;
}

export interface DemoPurgePlanEntry {
  table: string;
  label: string;
  count: number;
}

export interface DemoPurgeChainSummary {
  campaignId: number;
  movements: number;
  rootHash: string | null;
  verified: boolean;
}

export interface DemoPurgeVerdict {
  allowed: boolean;
  /** La campaña aún no está marcada como DEMO: falta el paso previo. */
  requiresDemoMarking: boolean;
  blockers: DemoPurgeIssue[];
  warnings: DemoPurgeIssue[];
  deletionPlan: DemoPurgePlanEntry[];
  unlinkPlan: DemoPurgePlanEntry[];
  preserved: DemoPurgePlanEntry[];
  affectedChains: DemoPurgeChainSummary[];
  /** Total de filas que se eliminarán (excluye las desvinculadas). */
  totalRecords: number;
}

export interface DemoPurgeAnalysisInput {
  campaign: DemoPurgeCampaign;
  counts: DemoPurgeCounts;
  real: DemoPurgeRealSignals;
  ledger: DemoPurgeLedgerState;
}

// ─── Análisis ────────────────────────────────────────────────────────────────

/**
 * Calcula el veredicto de seguridad de una purga DEMO. Es PURA: no consulta ni
 * modifica nada, de modo que la ruta puede ejecutarla tanto en la vista previa
 * como DENTRO de la transacción (con la fila de la campaña bloqueada) antes de
 * borrar, y los tests pueden cubrir cada bloqueo sin base de datos.
 */
export function analyzeDemoPurge(input: DemoPurgeAnalysisInput): DemoPurgeVerdict {
  const { campaign, counts, real, ledger } = input;
  const blockers: DemoPurgeIssue[] = [];
  const warnings: DemoPurgeIssue[] = [];

  const requiresDemoMarking = campaign.isDemo !== true;
  if (requiresDemoMarking) {
    blockers.push({
      code: "demo_not_marked",
      message:
        "La campaña no está declarada como DEMO. Márcala como campaña de demostración (queda registrado quién y cuándo) antes de purgarla.",
    });
  }

  if (real.reconciledDonations > 0) {
    blockers.push({
      code: "reconciled_donations",
      message: `Hay ${real.reconciledDonations} donación(es) conciliada(s) con el banco: es dinero real confirmado y no puede destruirse. Archiva la campaña o anula contablemente en vez de purgar.`,
    });
  }
  if (real.expensesWithReceipt > 0) {
    blockers.push({
      code: "expenses_with_receipt",
      message: `Hay ${real.expensesWithReceipt} gasto(s) con documento de respaldo (boleta o factura): existe obligación de conservación. Archiva la campaña o anula contablemente.`,
    });
  }
  if (real.leftoversWithFlow > 0) {
    blockers.push({
      code: "leftovers_with_flow",
      message: `Hay ${real.leftoversWithFlow} bien(es) con flujo real registrado (recibido/usado) o ligados a un donante o evidencia: no pueden tratarse como datos ficticios.`,
    });
  }
  if (real.evidenceLinkedToLeftovers > 0) {
    blockers.push({
      code: "evidence_documental",
      message: `Hay ${real.evidenceLinkedToLeftovers} evidencia(s) que sirven de prueba documental de un bien entregado: se conservan. Retíralas de la campaña antes de purgar.`,
    });
  }
  if (ledger.movementCount > 0 && !ledger.chainVerified) {
    blockers.push({
      code: "ledger_chain_broken",
      message: `La cadena contable de la campaña no verifica (se rompe en el asiento ${
        ledger.brokenAt ?? "desconocido"
      }). No se puede demostrar que sea exclusivamente de prueba: NO se elimina ningún movimiento.`,
    });
  }
  if (ledger.foreignSources.length > 0) {
    const sample = ledger.foreignSources
      .slice(0, 3)
      .map((s) => `#${s.movementId} (${s.sourceType} ${s.sourceId})`)
      .join(", ");
    blockers.push({
      code: "ledger_foreign_movements",
      message: `Hay ${ledger.foreignSources.length} asiento(s) cuyo origen no pertenece a esta campaña: ${sample}. Eliminarlos destruiría contabilidad de otra campaña.`,
    });
  }

  if (ledger.movementCount > 0 && ledger.chainVerified && ledger.foreignSources.length === 0) {
    warnings.push({
      code: "ledger_chain_removed",
      message: `Se eliminarán ${ledger.movementCount} asiento(s) de la cadena de prueba (raíz ${shortHash(
        ledger.rootHash,
      )}). Antes se guarda una copia íntegra y el manifiesto para poder reconstruirla y verificarla.`,
    });
  }
  if (counts.certificates > 0) {
    warnings.push({
      code: "certificates_unlinked",
      message: `${counts.certificates} certificado(s) se conservarán sin vínculo con la campaña (reconocen a personas).`,
    });
  }
  if (counts.community_reports > 0) {
    warnings.push({
      code: "community_reports_unlinked",
      message: `${counts.community_reports} reporte(s) ciudadano(s) se conservarán, solo se desvinculan de la campaña.`,
    });
  }
  if (counts.volunteer_participations > 0) {
    warnings.push({
      code: "volunteer_participations_unlinked",
      message: `${counts.volunteer_participations} participación(es) del voluntariado se conservarán sin vínculo con la campaña.`,
    });
  }
  if (counts.donations > 0) {
    warnings.push({
      code: "donors_preserved",
      message: `Los perfiles de donante (y el voluntariado) NO se borran: solo desaparecen las donaciones ficticias.`,
    });
  }

  const deletionPlan = DEMO_PURGE_DELETABLE_TABLES.map(({ table, label }) => ({
    table,
    label,
    count: counts[table] ?? 0,
  }));
  const unlinkPlan = DEMO_PURGE_UNLINKABLE_TABLES.map(({ table, label }) => ({
    table,
    label,
    count: counts[table] ?? 0,
  }));
  const preserved = DEMO_PURGE_PRESERVED.map(({ table, label }) => ({
    table,
    label,
    count: 0,
  }));

  const totalRecords = deletionPlan.reduce((sum, entry) => sum + entry.count, 0);

  const affectedChains: DemoPurgeChainSummary[] =
    ledger.movementCount > 0
      ? [
          {
            campaignId: campaign.id,
            movements: ledger.movementCount,
            rootHash: ledger.rootHash,
            verified: ledger.chainVerified,
          },
        ]
      : [];

  return {
    allowed: blockers.length === 0,
    requiresDemoMarking,
    blockers,
    warnings,
    deletionPlan,
    unlinkPlan,
    preserved,
    affectedChains,
    totalRecords,
  };
}

function shortHash(hash: string | null): string {
  if (!hash) return "sin movimientos";
  return `${hash.slice(0, 12)}…`;
}

// ─── Validación de la petición ───────────────────────────────────────────────

export interface DemoPurgeRequest {
  confirm: true;
  /** Identificador escrito a mano: debe coincidir con el id de la campaña. */
  identifier: string;
  reason: string;
  /** Reautenticación del superadmin (contraseña actual). */
  password: string;
  /** Código TOTP, obligatorio solo si el superadmin tiene 2FA activo. */
  totpCode: string | null;
}

export interface DemoMarkRequest {
  confirm: true;
  reason: string;
  password: string;
  totpCode: string | null;
}

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: string; message: string };

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readTotp(value: unknown): string | null {
  const code = readString(value);
  return code.length > 0 ? code : null;
}

/**
 * Valida el cuerpo de `POST /campaigns/:id/demo-purge`. Exige:
 *  1. confirmación explícita (`confirm: true`),
 *  2. el identificador de la campaña escrito literalmente (evita borrar otra),
 *  3. un motivo de al menos `MIN_DEMO_REASON` caracteres,
 *  4. la contraseña de reautenticación.
 * La verificación REAL de la contraseña la hace `lib/admin-reauth.ts`; aquí solo
 * se comprueba la forma, para que la ruta pueda responder 400 sin tocar la DB.
 */
export function validateDemoPurgeRequest(
  body: unknown,
  campaign: { id: number },
): ValidationResult<DemoPurgeRequest> {
  const raw = (body ?? {}) as Record<string, unknown>;
  if (raw.confirm !== true) {
    return {
      ok: false,
      code: "confirmation_required",
      message: "La purga definitiva exige confirmación explícita (confirm: true).",
    };
  }
  const identifier = readString(raw.identifier);
  if (identifier !== String(campaign.id)) {
    return {
      ok: false,
      code: "identifier_mismatch",
      message: `Escribe el identificador de la campaña (${campaign.id}) para confirmar que es la correcta.`,
    };
  }
  const reason = readString(raw.reason);
  if (reason.length < MIN_DEMO_REASON) {
    return {
      ok: false,
      code: "reason_required",
      message: `Indica el motivo de la purga (mínimo ${MIN_DEMO_REASON} caracteres). Queda en la auditoría y en el respaldo.`,
    };
  }
  const password = typeof raw.password === "string" ? raw.password : "";
  if (password.length === 0) {
    return {
      ok: false,
      code: "reauth_required",
      message: "Reautentícate con tu contraseña de superadministrador para continuar.",
    };
  }
  return {
    ok: true,
    value: { confirm: true, identifier, reason, password, totpCode: readTotp(raw.totpCode) },
  };
}

/** Valida el cuerpo de `POST /campaigns/:id/demo-mark` (declaración de DEMO). */
export function validateDemoMarkRequest(body: unknown): ValidationResult<DemoMarkRequest> {
  const raw = (body ?? {}) as Record<string, unknown>;
  if (raw.confirm !== true) {
    return {
      ok: false,
      code: "confirmation_required",
      message: "Marca la campaña como DEMO con confirmación explícita (confirm: true).",
    };
  }
  const reason = readString(raw.reason);
  if (reason.length < MIN_DEMO_REASON) {
    return {
      ok: false,
      code: "reason_required",
      message: `Explica por qué la campaña contiene datos de prueba (mínimo ${MIN_DEMO_REASON} caracteres).`,
    };
  }
  const password = typeof raw.password === "string" ? raw.password : "";
  if (password.length === 0) {
    return {
      ok: false,
      code: "reauth_required",
      message: "Reautentícate con tu contraseña de superadministrador para continuar.",
    };
  }
  return {
    ok: true,
    value: { confirm: true, reason, password, totpCode: readTotp(raw.totpCode) },
  };
}

// ─── Respaldo verificable (snapshot + manifiesto) ────────────────────────────

/**
 * Normaliza un valor para hashearlo de forma ESTABLE:
 *  - `Date` → ISO 8601 (jsonb devuelve las fechas como texto: sin esto, el hash
 *    del snapshot recién creado no coincidiría con el recomputado al leerlo),
 *  - claves de objeto ORDENADAS (jsonb reordena las claves),
 *  - `undefined` → `null` (JSON descarta las claves `undefined`).
 */
export function normalizeForHash(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((item) => normalizeForHash(item));
  if (typeof value === "object") {
    const source = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) {
      out[key] = normalizeForHash(source[key]);
    }
    return out;
  }
  return value;
}

/** Serialización canónica (claves ordenadas) de un snapshot. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(normalizeForHash(value));
}

/** SHA-256 (hex) del snapshot normalizado. */
export function hashSnapshot(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

export interface DemoPurgeManifest {
  algorithm: "sha256";
  hash: string;
  generatedAt: string;
  campaignId: number;
  campaignTitle: string;
  totalRecords: number;
  counts: DemoPurgeCounts;
  ledger: { movements: number; rootHash: string | null; verified: boolean };
}

/**
 * Construye el manifiesto de la operación. El `hash` cubre el snapshot completo
 * (no el manifiesto): así se puede recomputar desde el respaldo y comprobar que
 * la copia de seguridad no se alteró.
 */
export function buildDemoPurgeManifest(input: {
  snapshot: unknown;
  campaignId: number;
  campaignTitle: string;
  counts: DemoPurgeCounts;
  ledger: { movements: number; rootHash: string | null; verified: boolean };
}): DemoPurgeManifest {
  return {
    algorithm: "sha256",
    hash: hashSnapshot(input.snapshot),
    generatedAt: new Date().toISOString(),
    campaignId: input.campaignId,
    campaignTitle: input.campaignTitle,
    totalRecords: Object.values(input.counts).reduce((sum, n) => sum + n, 0),
    counts: input.counts,
    ledger: input.ledger,
  };
}

/** Recomputa el hash del snapshot y lo compara con el sellado (tiempo constante no requerido: no es un secreto). */
export function verifyDemoPurgeManifest(snapshot: unknown, expectedHash: string): boolean {
  return hashSnapshot(snapshot) === expectedHash;
}

/**
 * Reconstruye y verifica la cadena de hashes a partir del snapshot del respaldo.
 * Estrategia de reconstrucción verificable: los asientos guardados conservan
 * `prev_hash` y `hash`, de modo que la integridad histórica puede comprobarse
 * fuera de la base (la propia `verifyChain` de `lib/ledger.ts` la reutiliza).
 */
export function extractLedgerRowsFromSnapshot(snapshot: unknown): unknown[] {
  if (!snapshot || typeof snapshot !== "object") return [];
  const tables = (snapshot as { tables?: unknown }).tables;
  if (!tables || typeof tables !== "object") return [];
  const movements = (tables as Record<string, unknown>).campaign_movements;
  return Array.isArray(movements) ? movements : [];
}

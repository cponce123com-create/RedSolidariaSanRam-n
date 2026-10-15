/**
 * Purga definitiva de campañas DEMO (V7.2) — presentación y helpers PUROS.
 *
 * Traduce el análisis que devuelve `GET /api/campaigns/:id/demo-purge/preview` a
 * la información que muestra el panel: cuántos registros hay y de qué tipos, qué
 * bloquea la operación, qué se elimina, qué se desvincula y qué se conserva.
 *
 * Funciones puras y testeables (sin red, sin React), igual que
 * `lib/campaign-deletion.ts`. Las llamadas HTTP viven en `lib/campaign-admin.ts`.
 */

/** Longitud mínima del motivo (debe coincidir con el servidor). */
export const MIN_DEMO_REASON = 10;

export type DemoPurgeTableKey =
  | "campaign_movements"
  | "donation_consents"
  | "donation_proofs"
  | "donations"
  | "campaign_expenses"
  | "campaign_images"
  | "campaign_updates"
  | "campaign_budgets"
  | "campaign_evidence"
  | "campaign_leftovers"
  | "campaigns"
  | "community_reports"
  | "certificates"
  | "volunteer_participations";

export type DemoPurgeCounts = Record<DemoPurgeTableKey, number>;

export interface DemoPurgeCampaign {
  id: number;
  title: string;
  status: string;
  isDemo: boolean;
  demoMarkedAt: string | null;
  demoMarkedBy: string | null;
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
  requiresDemoMarking: boolean;
  blockers: DemoPurgeIssue[];
  warnings: DemoPurgeIssue[];
  deletionPlan: DemoPurgePlanEntry[];
  unlinkPlan: DemoPurgePlanEntry[];
  preserved: DemoPurgePlanEntry[];
  affectedChains: DemoPurgeChainSummary[];
  totalRecords: number;
}

export interface DemoPurgeRealSignals {
  reconciledDonations: number;
  expensesWithReceipt: number;
  leftoversWithFlow: number;
  evidenceLinkedToLeftovers: number;
  issuedCertificates: number;
}

export interface DemoPurgeLedgerState {
  movementCount: number;
  chainVerified: boolean;
  brokenAt: number | null;
  rootHash: string | null;
  foreignSources: Array<{ movementId: number; sourceType: string; sourceId: number }>;
}

export interface DemoPurgeAnalysis {
  campaign: DemoPurgeCampaign;
  counts: DemoPurgeCounts;
  real: DemoPurgeRealSignals;
  ledger: DemoPurgeLedgerState;
  verdict: DemoPurgeVerdict;
}

export interface DemoPurgeManifest {
  algorithm: string;
  hash: string;
  generatedAt: string;
  campaignId: number;
  campaignTitle: string;
  totalRecords: number;
  ledger: { movements: number; rootHash: string | null; verified: boolean };
}

export interface DemoPurgeResult {
  ok: boolean;
  campaignId: number;
  title: string;
  backupId: number;
  manifest: DemoPurgeManifest;
  removed: DemoPurgePlanEntry[];
  unlinked: {
    communityReports: number;
    certificates: number;
    volunteerParticipations: number;
  };
  assetsRemoved: number;
  assetsFailed: number;
}

// ─── Decisión y titulares ────────────────────────────────────────────────────

/** La purga DEMO es exclusiva del superadmin Y debe estar permitida por el servidor. */
export function canPurgeDemoCampaign(
  analysis: DemoPurgeAnalysis | undefined | null,
  role: string | null | undefined,
): boolean {
  if (!analysis) return false;
  if (role !== "superadmin") return false;
  return analysis.verdict.allowed === true;
}

/** ¿Falta declarar la campaña como DEMO antes de poder purgarla? */
export function needsDemoMarking(analysis: DemoPurgeAnalysis | undefined | null): boolean {
  return analysis?.verdict.requiresDemoMarking === true;
}

/**
 * Titular del análisis. Nunca dice «todo bien» si hay bloqueos: la interfaz no
 * debe invitar a confirmar una operación que el servidor va a rechazar.
 */
export function demoPurgeHeadline(analysis: DemoPurgeAnalysis | undefined | null): string {
  if (!analysis) return "Analizando la campaña…";
  if (analysis.verdict.allowed) return "Listo para eliminar definitivamente";
  if (analysis.verdict.requiresDemoMarking) return "Falta declararla como campaña DEMO";
  return "Purga bloqueada: hay datos que no se pueden destruir";
}

/**
 * Comprobación local del identificador escrito a mano. El servidor la repite
 * (fuente de verdad); aquí evita enviar una confirmación que se sabe incorrecta.
 */
export function identifierMatches(value: string, campaignId: number): boolean {
  return value.trim() === String(campaignId);
}

// ─── Pasos del diálogo ───────────────────────────────────────────────────────

export interface DemoPurgeStep {
  key: "analyze" | "mark" | "confirm";
  title: string;
  done: boolean;
  enabled: boolean;
}

/**
 * Pasos del flujo, en orden: (1) analizar, (2) declarar DEMO si falta y
 * (3) confirmar la purga. La confirmación solo se habilita cuando el análisis lo
 * permite, así que no se puede «saltar» al borrado.
 */
export function demoPurgeSteps(
  analysis: DemoPurgeAnalysis | undefined | null,
  role: string | null | undefined,
): DemoPurgeStep[] {
  const isSuperadmin = role === "superadmin";
  return [
    { key: "analyze", title: "Análisis de seguridad", done: Boolean(analysis), enabled: true },
    {
      key: "mark",
      title: "Declarar campaña DEMO",
      done: Boolean(analysis) && !needsDemoMarking(analysis),
      enabled: Boolean(analysis) && isSuperadmin && needsDemoMarking(analysis),
    },
    {
      key: "confirm",
      title: "Confirmación definitiva",
      done: false,
      enabled: canPurgeDemoCampaign(analysis, role),
    },
  ];
}

// ─── Descripciones de los registros ──────────────────────────────────────────

/** «3 Donaciones ficticias, 2 Gastos ficticios» (ignora recuentos en cero). */
export function describePlan(entries: readonly DemoPurgePlanEntry[] | undefined): string {
  if (!entries) return "";
  return entries
    .filter((entry) => entry.count > 0)
    .map((entry) => `${entry.count} ${entry.label.toLowerCase()}`)
    .join(", ");
}

/** Tipos de registro afectados (solo los que tienen filas). */
export function affectedTables(entries: readonly DemoPurgePlanEntry[] | undefined): string[] {
  if (!entries) return [];
  return entries.filter((entry) => entry.count > 0).map((entry) => entry.table);
}

/** Suma de un plan, tolerando entradas ausentes o negativas. */
export function totalOfPlan(entries: readonly DemoPurgePlanEntry[] | undefined): number {
  if (!entries) return 0;
  return entries.reduce((sum, entry) => sum + Math.max(0, entry.count), 0);
}

export interface DemoPurgeSummary {
  deletableRows: number;
  deletableTables: number;
  unlinkedRows: number;
  blockers: number;
  warnings: number;
}

/** Resumen numérico del veredicto, para las tarjetas del diálogo. */
export function demoPurgeSummary(
  verdict: DemoPurgeVerdict | undefined | null,
): DemoPurgeSummary {
  if (!verdict) {
    return { deletableRows: 0, deletableTables: 0, unlinkedRows: 0, blockers: 0, warnings: 0 };
  }
  return {
    deletableRows: totalOfPlan(verdict.deletionPlan),
    deletableTables: affectedTables(verdict.deletionPlan).length,
    unlinkedRows: totalOfPlan(verdict.unlinkPlan),
    blockers: verdict.blockers.length,
    warnings: verdict.warnings.length,
  };
}

/**
 * Frase con el bloqueo principal y cuántos más hay, para el encabezado de la
 * advertencia. `null` cuando no hay ningún bloqueo.
 */
export function blockerSummary(
  blockers: readonly DemoPurgeIssue[] | undefined,
): string | null {
  if (!blockers || blockers.length === 0) return null;
  const [first, ...rest] = blockers;
  return rest.length > 0
    ? `${first.message} (y ${rest.length} impedimento${rest.length === 1 ? "" : "s"} más)`
    : first.message;
}

/**
 * Texto del estado del libro contable afectado por la purga. Se muestra SIEMPRE
 * (aunque no haya asientos): es la parte que el superadmin debe poder auditar.
 */
export function describeLedger(ledger: DemoPurgeLedgerState | undefined | null): string {
  if (!ledger || ledger.movementCount === 0) {
    return "La campaña no tiene asientos en el libro contable.";
  }
  if (!ledger.chainVerified) {
    return `La cadena contable NO verifica (se rompe en el asiento ${
      ledger.brokenAt ?? "desconocido"
    }): la purga queda bloqueada.`;
  }
  if (ledger.foreignSources.length > 0) {
    return `Hay ${ledger.foreignSources.length} asiento(s) cuyo origen pertenece a otra campaña: la purga queda bloqueada.`;
  }
  return `${ledger.movementCount} asiento(s) de prueba (cadena verificada, raíz ${shortHash(
    ledger.rootHash,
  )}). Se guarda copia íntegra antes de eliminarlos.`;
}

/** Abrevia un hash para mostrarlo sin romper el diseño. */
export function shortHash(hash: string | null | undefined): string {
  if (!hash) return "—";
  return hash.length > 16 ? `${hash.slice(0, 12)}…` : hash;
}

// ─── Traspaso del menú «Más acciones» al diálogo ─────────────────────────────

/**
 * ¿Procede abrir el diálogo de una acción elegida en el menú? Solo cuando NO
 * queda ningún menú «Más acciones» abierto.
 *
 * Regresión cubierta (V7.2): abrir el diálogo desde el `onSelect` del menú monta
 * DOS capas modales de Radix en el mismo clic. Radix gestiona por capa el foco y
 * el `pointer-events` del `body`, y las dos se pisan: la consola avisa de
 * «Blocked aria-hidden on an element because its descendant retained focus» y el
 * `body` puede quedarse con `pointer-events: none`, con lo que el diálogo se ve
 * pero NO responde a ningún clic. Por eso se espera a que el menú termine de
 * cerrarse y solo entonces se abre.
 */
export function shouldOpenAfterMenuClose(
  openMenuFor: number | null,
  pending: { id: number } | null,
): boolean {
  return openMenuFor === null && pending !== null;
}

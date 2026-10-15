/**
 * Anulación contable de donaciones (V7.2.2) — presentación y helpers PUROS.
 *
 * Una donación confirmada queda encadenada en el libro y la máquina de estados
 * prohíbe volver atrás, así que no se borra: se ANULA. El servidor marca la
 * donación como `annulled` (sale de todas las cifras) y añade un ASIENTO
 * COMPENSATORIO al libro append-only, de modo que el saldo sigue cuadrando y la
 * cadena sigue verificando. El porqué completo está en el módulo del servidor
 * (`lib/donation-annulment.ts`).
 *
 * Funciones puras y testeables (sin red, sin React). Las llamadas HTTP viven en
 * `lib/donors-admin.ts`.
 */

/** Longitud mínima del motivo (debe coincidir con el servidor). */
export const MIN_ANNUL_REASON = 10;

export const ANNULLED_STATUS = "annulled";

export interface AnnulmentImpact {
  donationId: number;
  amount: number;
  campaignId: number | null;
  reversal: boolean;
  reconciled: boolean;
}

export interface AnnulmentBlockedDonation {
  donationId: number;
  status: string;
  message: string;
}

export interface CampaignAnnulmentPlan {
  campaignId: number;
  annullable: AnnulmentImpact[];
  blocked: AnnulmentBlockedDonation[];
  totalAmount: number;
  reconciledCount: number;
  allowed: boolean;
}

export interface CampaignAnnulmentPreview {
  campaign: { id: number; title: string; status: string };
  plan: CampaignAnnulmentPlan;
}

export interface AnnulmentLedgerState {
  verified: boolean;
  brokenAt: number | null;
  rootHash: string | null;
  count: number;
}

export interface DonationVoidResult {
  ok: boolean;
  donation: { id: number; status: string; amount: number; voidReason: string | null };
  reversal: { appended: boolean; movementId: number | null };
  ledger: AnnulmentLedgerState | null;
  warnings: { code: string; message: string }[];
}

export interface CampaignVoidResult {
  ok: boolean;
  campaign: { id: number; title: string };
  annulled: number;
  totalAmount: number;
  reversals: number;
  blocked: AnnulmentBlockedDonation[];
  ledger: AnnulmentLedgerState;
}

// ─── Decisión ────────────────────────────────────────────────────────────────

/**
 * ¿Se puede anular? Exclusivo del superadmin y solo para donaciones CONFIRMADAS
 * (aprobadas o conciliadas): son las únicas con asiento en el libro. Una
 * pendiente o rechazada no tiene asiento y se gestiona con el rechazo normal.
 */
export function canVoidDonation(status: string, role: string | null | undefined): boolean {
  if (role !== "superadmin") return false;
  return status === "approved" || status === "reconciled";
}

/** Motivo por el que NO se puede anular una donación, o `null` si es posible. */
export function voidBlockReason(status: string): string | null {
  if (status === ANNULLED_STATUS) return "La donación ya está anulada.";
  if (status === "pending" || status === "rejected") {
    return "Solo se anulan donaciones confirmadas (aprobadas o conciliadas). Esta no tiene asiento en el libro: recházala con la acción normal.";
  }
  if (status !== "approved" && status !== "reconciled") {
    return `No se puede anular una donación en estado «${status}».`;
  }
  return null;
}

// ─── Descripciones del plan ──────────────────────────────────────────────────

export interface AnnulmentSummary {
  count: number;
  totalAmount: number;
  reconciled: number;
  blocked: number;
}

/** Resumen numérico del plan, para las tarjetas del diálogo. */
export function annulmentSummary(
  plan: CampaignAnnulmentPlan | undefined | null,
): AnnulmentSummary {
  if (!plan) return { count: 0, totalAmount: 0, reconciled: 0, blocked: 0 };
  return {
    count: plan.annullable.length,
    totalAmount: plan.totalAmount,
    reconciled: plan.reconciledCount,
    blocked: plan.blocked.length,
  };
}

/**
 * Plural castellano correcto: «1 donación» / «2 donaciones» (el plural pierde la
 * tilde). Concatenar «es» al singular daría «donaciónes».
 */
function donationsLabel(count: number): string {
  return count === 1 ? "1 donación" : `${count} donaciones`;
}

/** Titular del plan. Nunca invita a confirmar cuando no hay nada que anular. */
export function annulmentHeadline(plan: CampaignAnnulmentPlan | undefined | null): string {
  if (!plan) return "Analizando las donaciones…";
  if (!plan.allowed) return "No hay donaciones confirmadas que anular";
  const n = plan.annullable.length;
  return `${donationsLabel(n)} se anulará${n === 1 ? "" : "n"} contablemente`;
}

/** «3 donaciones · S/ 160.50», con el importe formateado a 2 decimales. */
export function describeAnnulmentPlan(plan: CampaignAnnulmentPlan | undefined | null): string {
  const summary = annulmentSummary(plan);
  if (summary.count === 0) return "Sin donaciones que anular";
  return `${donationsLabel(summary.count)} · S/ ${summary.totalAmount.toFixed(2)}`;
}

/** Aviso cuando parte del plan está conciliado con el banco (dinero real). */
export function reconciledWarning(
  plan: CampaignAnnulmentPlan | undefined | null,
): string | null {
  const summary = annulmentSummary(plan);
  if (summary.reconciled === 0) return null;
  return `${summary.reconciled} de ellas está${summary.reconciled === 1 ? "" : "n"} CONCILIADA(S) con el banco: si el dinero entró realmente, anularlas sin devolución descuadra las cuentas reales.`;
}

/** Texto de confirmación del asiento compensatorio que se añadirá al libro. */
export function reversalNotice(plan: CampaignAnnulmentPlan | undefined | null): string {
  const summary = annulmentSummary(plan);
  const withReversal = (plan?.annullable ?? []).filter((item) => item.reversal).length;
  if (summary.count === 0) return "";
  return `Se añadirán ${withReversal} asiento(s) compensatorio(s) al libro append-only: la donación sale de las cifras y la cadena sigue verificando. No se borra ningún registro.`;
}

/** Compara el identificador escrito a mano (confirmación fuerte del bloque). */
export function campaignIdentifierMatches(value: string, campaignId: number): boolean {
  return value.trim() === String(campaignId);
}

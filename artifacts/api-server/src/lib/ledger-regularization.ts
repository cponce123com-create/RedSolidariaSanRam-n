/**
 * Regularización del libro contable (Prompt Maestro V7.1 · Fase 2).
 *
 * El libro (`campaign_movements`) es APPEND-ONLY y va encadenado por hashes: no
 * se edita ni se borra. Cuando el informe de integridad detecta una donación
 * confirmada SIN asiento (hallazgo DB-09), la única corrección admisible es
 * APILAR un asiento compensatorio autorizado y trazable —nunca reescribir el
 * historial—.
 *
 * Este módulo es PURO (sin DB): describe el PLAN de regularización a partir del
 * informe y valida la solicitud administrativa. La ruta aplica el plan dentro de
 * una transacción y lo registra en la auditoría.
 *
 * Reglas:
 *   - Solo se regularizan DONACIONES CONFIRMADAS sin asiento. Nunca se toca un
 *     asiento existente ni se regulariza una donación pendiente/rechazada.
 *   - Una donación sin campaña no puede entrar al libro de una campaña: queda
 *     fuera del plan y se informa como «no regularizable por falta de campaña».
 *   - Toda regularización exige autorización reforzada (superadmin), un motivo
 *     escrito y una referencia de evidencia documental.
 */

import { roundMoney } from "./funding";

/** Asiento compensatorio propuesto. Mismo contrato que `LedgerEntryInput`. */
export interface RegularizationEntry {
  kind: "ingreso";
  campaignId: number;
  amount: number;
  description: string;
  sourceType: "donation";
  sourceId: number;
}

/** Donación confirmada sin asiento que NO puede regularizarse (sin campaña). */
export interface UnregularizableDonation {
  id: number;
  amount: number;
  reason: string;
}

export interface RegularizationPlan {
  /** Asientos a APILAR (uno por donación confirmada sin asiento). */
  entries: RegularizationEntry[];
  /** Donaciones confirmadas sin asiento que no admiten regularización. */
  skipped: UnregularizableDonation[];
  /** Cuántos asientos se crearían. */
  total: number;
  /** Suma de los importes a regularizar (informativo). */
  amount: number;
}

/** Entrada mínima del informe de integridad que consume el plan. */
export interface AuditDonationLike {
  id: number;
  campaignId: number | null;
  amount: number | string;
}

/**
 * Plan de regularización: por cada donación confirmada sin asiento CON campaña,
 * propone un `ingreso` cuyo origen es la propia donación. El índice único
 * (source_type, source_id) de la base impide duplicar el asiento si se reintenta.
 */
export function planRegularization(
  donationsWithoutMovement: readonly AuditDonationLike[],
): RegularizationPlan {
  const entries: RegularizationEntry[] = [];
  const skipped: UnregularizableDonation[] = [];

  for (const donation of donationsWithoutMovement) {
    const amount = Math.max(0, roundMoney(donation.amount));
    if (donation.campaignId === null) {
      skipped.push({
        id: donation.id,
        amount,
        reason:
          "La donación no está asignada a ninguna campaña: no tiene libro donde registrarse.",
      });
      continue;
    }
    entries.push({
      kind: "ingreso",
      campaignId: donation.campaignId,
      amount,
      description: `Regularización: asiento faltante de la donación #${donation.id}`,
      sourceType: "donation",
      sourceId: donation.id,
    });
  }

  const amount = roundMoney(entries.reduce((sum, entry) => sum + entry.amount, 0));
  return { entries, skipped, total: entries.length, amount };
}

export const MIN_REGULARIZATION_REASON = 10;

export interface RegularizationRequest {
  donationIds: number[];
  reason: string;
  evidenceRef: string;
}

export type RegularizationValidation =
  | { ok: true; value: RegularizationRequest }
  | { ok: false; message: string };

function toPositiveIntArray(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null;
  const ids: number[] = [];
  for (const item of value) {
    const n = typeof item === "number" ? item : Number(item);
    if (!Number.isInteger(n) || n <= 0) return null;
    ids.push(n);
  }
  return [...new Set(ids)];
}

/**
 * Valida la solicitud de regularización. Exige confirmación explícita, al menos
 * una donación, un motivo escrito suficientemente descriptivo y una referencia
 * de evidencia documental (ambos quedan en la auditoría).
 */
export function validateRegularizationRequest(
  body: unknown,
): RegularizationValidation {
  const source = (body ?? {}) as Record<string, unknown>;

  if (source.confirm !== true) {
    return {
      ok: false,
      message:
        "La regularización exige confirmación explícita (confirm: true). No modifica el historial: apila asientos compensatorios.",
    };
  }

  const donationIds = toPositiveIntArray(source.donationIds);
  if (donationIds === null || donationIds.length === 0) {
    return {
      ok: false,
      message:
        "Indica al menos una donación a regularizar (donationIds con identificadores válidos).",
    };
  }

  const reason = typeof source.reason === "string" ? source.reason.trim() : "";
  if (reason.length < MIN_REGULARIZATION_REASON) {
    return {
      ok: false,
      message: `Indica el motivo de la regularización (mínimo ${MIN_REGULARIZATION_REASON} caracteres). Queda registrado en la auditoría.`,
    };
  }

  const evidenceRef =
    typeof source.evidenceRef === "string" ? source.evidenceRef.trim() : "";
  if (evidenceRef.length === 0) {
    return {
      ok: false,
      message:
        "Adjunta una referencia de evidencia documental (nº de comprobante, voucher o informe) que respalde la regularización.",
    };
  }

  return { ok: true, value: { donationIds, reason, evidenceRef } };
}

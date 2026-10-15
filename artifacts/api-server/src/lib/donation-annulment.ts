import {
  MIN_ANNUL_REASON,
  annulBlockReason,
  annulReversalDescription,
  isAnnulledDonation,
} from "./donor-identity";

/**
 * Anulación contable de donaciones (V7.2.2).
 *
 * PROBLEMA QUE RESUELVE
 * ---------------------
 * Una donación confirmada queda encadenada en el libro y la máquina de estados
 * prohíbe volver atrás (`PUT /donations/:id` solo acepta pending/approved/rejected
 * y rechaza cualquier transición desde `approved`). Sin una vía de corrección, un
 * dato de prueba —o una donación registrada por error— bloquea para siempre la
 * campaña: las cifras no se pueden limpiar y la purga DEMO queda bloqueada por
 * una donación conciliada.
 *
 * POR QUÉ ANULAR Y NO BORRAR
 * --------------------------
 * Borrar la donación dejaría su asiento huérfano (el informe de integridad lo
 * señalaría como `movementsWithoutSource`) y rompería la cadena de hashes. La
 * corrección correcta es la que documenta el propio libro: un ASIENTO
 * COMPENSATORIO autorizado y trazable.
 *
 *   · la donación pasa a `status = 'annulled'` → sale de TODAS las cifras, porque
 *     los agregados filtran por `CONFIRMED_DONATION_STATUSES`;
 *   · se añade un asiento de signo contrario (`gasto`, mismo importe, origen
 *     `donation_reversal`) → el saldo del libro sigue cuadrando con sus orígenes
 *     y la cadena sigue verificando;
 *   · el motivo, quién y cuándo quedan guardados en la donación y en la auditoría.
 *
 * Todo lo de este módulo son FUNCIONES PURAS: la ruta las usa y los tests las
 * verifican sin tocar la base.
 */

export interface AnnulmentDonation {
  id: number;
  campaignId: number | null;
  firstName: string;
  lastName: string;
  email: string;
  amount: number;
  status: string;
  reconciledAt: string | null;
}

export interface AnnulmentIssue {
  code: string;
  message: string;
}

export interface AnnulmentImpact {
  donationId: number;
  amount: number;
  campaignId: number | null;
  /** Se añadirá un asiento compensatorio al libro (tenía asiento de ingreso). */
  reversal: boolean;
  /** Estaba conciliada con el banco: la anulación tiene consecuencias reales. */
  reconciled: boolean;
}

export interface AnnulmentVerdict {
  allowed: boolean;
  blockers: AnnulmentIssue[];
  warnings: AnnulmentIssue[];
  impact: AnnulmentImpact | null;
}

/** Verifica una anulación individual. PURA. */
export function analyzeAnnulment(input: {
  donation: AnnulmentDonation;
  /** ¿La donación tiene asiento en el libro? (`sourceType='donation'`) */
  hasMovement: boolean;
}): AnnulmentVerdict {
  const { donation, hasMovement } = input;
  const blockers: AnnulmentIssue[] = [];
  const warnings: AnnulmentIssue[] = [];

  const blocked = annulBlockReason(donation.status);
  if (blocked) {
    blockers.push({ code: "invalid_status", message: blocked });
  }
  if (!hasMovement && donation.status !== "annulled") {
    // Sin asiento no hay nada que compensar: se puede anular igualmente, pero
    // conviene avisar de que no habrá asiento compensatorio.
    warnings.push({
      code: "no_movement",
      message:
        "Esta donación no tiene asiento en el libro contable: la anulación solo cambia su estado (no hay ingreso que compensar).",
    });
  }
  if (donation.status === "reconciled") {
    warnings.push({
      code: "reconciled",
      message:
        "La donación está CONCILIADA con el banco. Si el dinero entró realmente, anularla sin devolución descuadra las cuentas: úsalo solo si la conciliación fue un error.",
    });
  }

  return {
    allowed: blockers.length === 0,
    blockers,
    warnings,
    impact:
      blockers.length === 0
        ? {
            donationId: donation.id,
            amount: donation.amount,
            campaignId: donation.campaignId,
            reversal: hasMovement,
            reconciled: donation.status === "reconciled" || donation.reconciledAt !== null,
          }
        : null,
  };
}

export interface CampaignAnnulmentPlan {
  campaignId: number;
  /** Donaciones que SÍ se anularán, con su impacto. */
  annullable: AnnulmentImpact[];
  /** Donaciones que no se pueden anular (con el motivo). */
  blocked: { donationId: number; status: string; message: string }[];
  totalAmount: number;
  reconciledCount: number;
  /** Hay algo que anular. */
  allowed: boolean;
}

/**
 * Plan de anulación en bloque de una campaña: qué donaciones se anularán, por
 * cuánto, cuántas estaban conciliadas y cuáles no se pueden tocar. PURA.
 *
 * Solo entran las CONFIRMADAS (aprobadas o conciliadas); las pendientes y
 * rechazadas no tienen asiento y se gestionan con el rechazo normal, así que se
 * informan como bloqueadas en vez de ignorarlas en silencio.
 */
export function planCampaignAnnulment(input: {
  campaignId: number;
  donations: readonly AnnulmentDonation[];
  /** Ids de donaciones con asiento en el libro. */
  movementDonationIds: readonly number[];
}): CampaignAnnulmentPlan {
  const withMovement = new Set(input.movementDonationIds);
  const annullable: AnnulmentImpact[] = [];
  const blocked: CampaignAnnulmentPlan["blocked"] = [];

  for (const donation of input.donations) {
    const verdict = analyzeAnnulment({
      donation,
      hasMovement: withMovement.has(donation.id),
    });
    if (verdict.allowed && verdict.impact) {
      annullable.push(verdict.impact);
      continue;
    }
    // Una donación ya anulada no es un "bloqueo": simplemente no se repite.
    if (isAnnulledDonation(donation.status)) continue;
    blocked.push({
      donationId: donation.id,
      status: donation.status,
      message: verdict.blockers[0]?.message ?? "No se puede anular.",
    });
  }

  const totalAmount =
    Math.round(
      annullable.reduce((sum, item) => sum + (Number.isFinite(item.amount) ? item.amount : 0), 0) * 100,
    ) / 100;

  return {
    campaignId: input.campaignId,
    annullable,
    blocked,
    totalAmount,
    reconciledCount: annullable.filter((item) => item.reconciled).length,
    allowed: annullable.length > 0,
  };
}

// ─── Validación de la petición ───────────────────────────────────────────────

export interface AnnulmentRequest {
  confirm: true;
  reason: string;
  /** Reautenticación del superadmin. */
  password: string;
  totpCode: string | null;
}

export type AnnulmentValidation =
  | { ok: true; value: AnnulmentRequest }
  | { ok: false; code: string; message: string };

/**
 * Valida el cuerpo de la anulación (individual o en bloque): confirmación
 * explícita, motivo suficientemente largo y contraseña de reautenticación. La
 * verificación REAL de la contraseña la hace `lib/admin-reauth.ts`.
 */
export function validateAnnulmentRequest(body: unknown): AnnulmentValidation {
  const raw = (body ?? {}) as Record<string, unknown>;
  if (raw.confirm !== true) {
    return {
      ok: false,
      code: "confirmation_required",
      message: "La anulación contable exige confirmación explícita (confirm: true).",
    };
  }
  const reason = typeof raw.reason === "string" ? raw.reason.trim() : "";
  if (reason.length < MIN_ANNUL_REASON) {
    return {
      ok: false,
      code: "reason_required",
      message: `Indica el motivo de la anulación (mínimo ${MIN_ANNUL_REASON} caracteres). Queda en la auditoría y en el asiento compensatorio del libro.`,
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
  const rawTotp = typeof raw.totpCode === "string" ? raw.totpCode.trim() : "";
  return {
    ok: true,
    value: { confirm: true, reason, password, totpCode: rawTotp.length > 0 ? rawTotp : null },
  };
}

export { annulReversalDescription };

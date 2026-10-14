import { roundMoney } from "./funding";

/**
 * Auditoría del libro contable (Prompt Maestro V7, Fase 1.4).
 *
 * El libro (`campaign_movements`) es append-only y va encadenado por hashes: la
 * verificación de la cadena ya existe y es pública. Lo que faltaba es un
 * INFORME para el panel que además coteje el libro con sus orígenes, porque una
 * cadena íntegra puede estar incompleta: los datos históricos cargados por seed
 * dejaron donaciones aprobadas SIN asiento (hallazgo DB-09), y entonces la
 * cadena "verifica" pero el libro no cuenta toda la historia.
 *
 * Reglas:
 *   - NO modifica nada: es un informe de solo lectura.
 *   - Señala, no corrige: cualquier corrección posterior debe ser un asiento
 *     compensatorio autorizado y trazable (el libro no se edita).
 *
 * Funciones PURAS y testeables (sin DB): la ruta las alimenta con las filas.
 */

export interface MovementLike {
  id: number;
  campaignId: number;
  kind: string;
  amount: number | string;
  sourceType: string;
  sourceId: number;
}

export interface SourceLike {
  id: number;
  campaignId: number | null;
  amount: number | string;
}

/** Una donación y si está confirmada (aprobada o conciliada). */
export interface DonationLike extends SourceLike {
  confirmed: boolean;
}

/** Resultado de la verificación de la cadena (mismo contrato que `VerifyResult`). */
export interface ChainResult {
  verified: boolean;
  brokenAt: number | null;
  /** `null` cuando la cadena está rota o vacía: no hay raíz que anclar. */
  rootHash: string | null;
  count: number;
}

export interface LedgerAuditReport {
  chain: ChainResult;
  movementCount: number;
  /** Donaciones confirmadas SIN asiento en el libro (ingresos no auditables). */
  donationsWithoutMovement: { id: number; campaignId: number | null; amount: number }[];
  /** Asientos cuyo origen no existe o es de un tipo desconocido. */
  movementsWithoutSource: { id: number; sourceType: string; sourceId: number }[];
  /** Asientos cuyo importe no coincide con el de su origen. */
  amountMismatches: {
    movementId: number;
    sourceType: string;
    sourceId: number;
    movementAmount: number;
    sourceAmount: number;
  }[];
  /** Asientos que apuntan a una campaña distinta de la de su origen. */
  campaignMismatches: {
    movementId: number;
    sourceType: string;
    sourceId: number;
    movementCampaignId: number;
    sourceCampaignId: number | null;
  }[];
  /** Cadena íntegra y libro cuadrado con sus orígenes. */
  healthy: boolean;
}

export const KNOWN_SOURCE_TYPES = ["donation", "expense"] as const;

function sourceKey(sourceType: string, sourceId: number): string {
  return `${sourceType}:${sourceId}`;
}

export function auditLedger(input: {
  movements: readonly MovementLike[];
  donations: readonly DonationLike[];
  expenses: readonly SourceLike[];
  chain: ChainResult;
}): LedgerAuditReport {
  const { movements, donations, expenses, chain } = input;

  const donationsById = new Map(donations.map((d) => [d.id, d]));
  const expensesById = new Map(expenses.map((e) => [e.id, e]));
  const movementBySource = new Map<string, MovementLike>();
  for (const movement of movements) {
    movementBySource.set(sourceKey(movement.sourceType, movement.sourceId), movement);
  }

  // 1) Donaciones confirmadas sin asiento: la cadena puede verificar y el libro
  //    seguir sin contar ese ingreso.
  const donationsWithoutMovement = donations
    .filter((d) => d.confirmed && !movementBySource.has(sourceKey("donation", d.id)))
    .map((d) => ({
      id: d.id,
      campaignId: d.campaignId,
      amount: roundMoney(d.amount),
    }));

  // 2) Asientos cuyo origen no existe o es desconocido.
  const movementsWithoutSource: LedgerAuditReport["movementsWithoutSource"] = [];
  const amountMismatches: LedgerAuditReport["amountMismatches"] = [];
  const campaignMismatches: LedgerAuditReport["campaignMismatches"] = [];

  for (const movement of movements) {
    const source =
      movement.sourceType === "donation"
        ? donationsById.get(movement.sourceId)
        : movement.sourceType === "expense"
          ? expensesById.get(movement.sourceId)
          : undefined;

    if (!source) {
      movementsWithoutSource.push({
        id: movement.id,
        sourceType: movement.sourceType,
        sourceId: movement.sourceId,
      });
      continue;
    }

    const movementAmount = roundMoney(movement.amount);
    const sourceAmount = roundMoney(source.amount);
    if (movementAmount !== sourceAmount) {
      amountMismatches.push({
        movementId: movement.id,
        sourceType: movement.sourceType,
        sourceId: movement.sourceId,
        movementAmount,
        sourceAmount,
      });
    }

    if (movement.campaignId !== source.campaignId) {
      campaignMismatches.push({
        movementId: movement.id,
        sourceType: movement.sourceType,
        sourceId: movement.sourceId,
        movementCampaignId: movement.campaignId,
        sourceCampaignId: source.campaignId,
      });
    }
  }

  const healthy =
    chain.verified &&
    donationsWithoutMovement.length === 0 &&
    movementsWithoutSource.length === 0 &&
    amountMismatches.length === 0 &&
    campaignMismatches.length === 0;

  return {
    chain,
    movementCount: movements.length,
    donationsWithoutMovement,
    movementsWithoutSource,
    amountMismatches,
    campaignMismatches,
    healthy,
  };
}

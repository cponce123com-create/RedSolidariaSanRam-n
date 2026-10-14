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

/** Asientos que comparten origen: un origen debe generar UN solo asiento. */
export interface DuplicateMovementGroup {
  sourceType: string;
  sourceId: number;
  movementIds: number[];
  count: number;
}

/** Saldos por campaña: lo que dice el libro frente a lo que dicen los orígenes. */
export interface CampaignTotals {
  campaignId: number;
  ledgerIncome: number;
  ledgerExpense: number;
  ledgerNet: number;
  sourceIncome: number;
  sourceExpense: number;
  sourceNet: number;
  balanced: boolean;
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
  /** Orígenes con más de un asiento: duplicación contable. */
  duplicateMovements: DuplicateMovementGroup[];
  /** Saldos por campaña (libro vs. orígenes). */
  totals: CampaignTotals[];
  /** Campañas cuyo saldo del libro no cuadra con sus orígenes. */
  unbalancedCampaigns: number[];
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
  const movementsBySource = new Map<string, MovementLike[]>();
  for (const movement of movements) {
    const key = sourceKey(movement.sourceType, movement.sourceId);
    const bucket = movementsBySource.get(key);
    if (bucket) bucket.push(movement);
    else movementsBySource.set(key, [movement]);
  }

  // 1) Donaciones confirmadas sin asiento: la cadena puede verificar y el libro
  //    seguir sin contar ese ingreso.
  const donationsWithoutMovement = donations
    .filter((d) => d.confirmed && !movementsBySource.has(sourceKey("donation", d.id)))
    .map((d) => ({
      id: d.id,
      campaignId: d.campaignId,
      amount: roundMoney(d.amount),
    }));

  // 2) Asientos cuyo origen no existe, importe descuadrado o campaña distinta.
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

  // 3) Movimientos duplicados: la base ya tiene un índice único por
  //    (source_type, source_id), así que esto es una red de seguridad —si
  //    apareciera un duplicado, el informe lo señala en vez de sumar dos veces.
  const duplicateMovements: DuplicateMovementGroup[] = [];
  for (const [key, group] of movementsBySource.entries()) {
    if (group.length <= 1) continue;
    const [sourceType, rawId] = key.split(":");
    duplicateMovements.push({
      sourceType,
      sourceId: Number(rawId),
      movementIds: group.map((m) => m.id),
      count: group.length,
    });
  }
  duplicateMovements.sort((a, b) => b.count - a.count || a.sourceType.localeCompare(b.sourceType));

  // 4) Saldos y totales por campaña: el libro frente a sus orígenes. Un libro
  //    con la cadena íntegra puede tener el saldo descuadrado si falta o sobra
  //    un asiento; esto lo hace visible sin corregir nada.
  const ledgerByCampaign = new Map<number, { income: number; expense: number }>();
  for (const movement of movements) {
    const bucket = ledgerByCampaign.get(movement.campaignId) ?? { income: 0, expense: 0 };
    if (movement.kind === "ingreso") bucket.income += roundMoney(movement.amount);
    else if (movement.kind === "gasto") bucket.expense += roundMoney(movement.amount);
    ledgerByCampaign.set(movement.campaignId, bucket);
  }

  const sourceByCampaign = new Map<number, { income: number; expense: number }>();
  for (const donation of donations) {
    // El libro solo registra ingresos CONFIRMADOS: una donación pendiente o
    // rechazada no es un origen y no debe descuadrar el saldo.
    if (!donation.confirmed) continue;
    if (donation.campaignId === null) continue;
    const bucket = sourceByCampaign.get(donation.campaignId) ?? { income: 0, expense: 0 };
    bucket.income += roundMoney(donation.amount);
    sourceByCampaign.set(donation.campaignId, bucket);
  }
  for (const expense of expenses) {
    if (expense.campaignId === null) continue;
    const bucket = sourceByCampaign.get(expense.campaignId) ?? { income: 0, expense: 0 };
    bucket.expense += roundMoney(expense.amount);
    sourceByCampaign.set(expense.campaignId, bucket);
  }

  const campaignIds = [...new Set([...ledgerByCampaign.keys(), ...sourceByCampaign.keys()])].sort(
    (a, b) => a - b,
  );
  const totals: CampaignTotals[] = campaignIds.map((campaignId) => {
    const ledger = ledgerByCampaign.get(campaignId) ?? { income: 0, expense: 0 };
    const source = sourceByCampaign.get(campaignId) ?? { income: 0, expense: 0 };
    const ledgerNet = roundMoney(ledger.income - ledger.expense);
    const sourceNet = roundMoney(source.income - source.expense);
    return {
      campaignId,
      ledgerIncome: roundMoney(ledger.income),
      ledgerExpense: roundMoney(ledger.expense),
      ledgerNet,
      sourceIncome: roundMoney(source.income),
      sourceExpense: roundMoney(source.expense),
      sourceNet,
      balanced: ledgerNet === sourceNet,
    };
  });
  const unbalancedCampaigns = totals.filter((t) => !t.balanced).map((t) => t.campaignId);

  const healthy =
    chain.verified &&
    donationsWithoutMovement.length === 0 &&
    movementsWithoutSource.length === 0 &&
    amountMismatches.length === 0 &&
    campaignMismatches.length === 0 &&
    duplicateMovements.length === 0 &&
    unbalancedCampaigns.length === 0;

  return {
    chain,
    movementCount: movements.length,
    donationsWithoutMovement,
    movementsWithoutSource,
    amountMismatches,
    campaignMismatches,
    duplicateMovements,
    totals,
    unbalancedCampaigns,
    healthy,
  };
}

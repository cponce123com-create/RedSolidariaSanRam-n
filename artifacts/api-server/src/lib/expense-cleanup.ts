import {
  CLASSIFICATION_LABEL,
  isPlaceholderMedia,
  isOwnDocument,
  type DemoClassification,
} from "./demo-classification";
import { verifyChain, type LedgerRow } from "./ledger";

/**
 * Corrección de GASTOS DEMO (V10.1) — FUNCIONES PURAS.
 *
 * Responde a una pregunta concreta por cada gasto: **¿qué se puede hacer con él, y
 * por qué?** Sin tocar la base: recibe las filas y devuelve el veredicto con su
 * evidencia, para que la interfaz pueda mostrarlo y el superadmin decida.
 *
 * CUATRO SITUACIONES (las del enunciado), nunca dos:
 *
 *   · `delete`             ficticio SIN asiento → eliminación definitiva.
 *   · `purge_with_ledger`  ficticio con asiento EXCLUSIVAMENTE de prueba y solo si
 *                          la cadena resultante sigue verificando.
 *   · `regularize`         real sin asiento → corrección autorizada (falta el
 *                          asiento, no se destruye el gasto).
 *   · `annul`              real contabilizado → anulación trazable, sin destruir
 *                          el histórico.
 *   · `review`             lo demás: lo decide una persona.
 *
 * NO se asume que un gasto huérfano (cuya campaña ya no existe) sea ficticio: se
 * marca `review` con el motivo, porque sin campaña no hay declaración DEMO que lo
 * respalde.
 *
 * REGLA DE LA CADENA: un asiento solo puede retirarse si al quitarlo la cadena de
 * su campaña SIGUE verificando. Como los hashes encadenan cada asiento con el
 * anterior, eso solo ocurre de forma segura cuando el asiento es el ÚLTIMO de su
 * cadena. Si no lo es, se bloquea y se propone la purga de la campaña completa (que
 * retira la cadena entera) o la anulación. **Nunca se reescribe un hash.**
 */

export const EXPENSE_ACTIONS = [
  "delete",
  "purge_with_ledger",
  "regularize",
  "annul",
  "review",
] as const;
export type ExpenseAction = (typeof EXPENSE_ACTIONS)[number];

export const EXPENSE_ACTION_LABEL: Record<ExpenseAction, string> = {
  delete: "Eliminación definitiva",
  purge_with_ledger: "Purga controlada (con asiento de prueba)",
  regularize: "Corrección autorizada (le falta asiento)",
  annul: "Anulación trazable",
  review: "Revisión manual",
};

export interface ExpenseRow {
  id: number;
  campaignId: number;
  description: string;
  amount: number;
  date: string;
  category: string;
  responsible: string | null;
  observations: string | null;
  receiptUrl: string | null;
  receiptType: string | null;
  isPublic: boolean;
  createdAt: Date | string | null;
}

export interface ExpenseCampaignRow {
  id: number;
  title: string;
  status: string;
  isDemo: boolean;
}

/** Asiento del libro con su campaña (para agrupar y verificar cadenas). */
export interface ExpenseMovementRow extends LedgerRow {
  campaignId: number;
}

export interface ExpenseLedgerRef {
  id: number;
  kind: string;
  amount: number;
  sourceType: string;
  sourceId: number;
  isTail: boolean;
}

export interface ExpenseDiagnosis {
  id: number;
  campaignId: number;
  campaignTitle: string;
  campaignStatus: string | null;
  campaignExists: boolean;
  isOrphan: boolean;
  description: string;
  amount: number;
  date: string;
  category: string;
  receiptUrl: string | null;
  hasOwnDocument: boolean;
  hasPlaceholderReceipt: boolean;
  classification: DemoClassification;
  classificationLabel: string;
  /** Clasificación DEDUCIDA automáticamente (sin contar la declaración manual). */
  computedClassification: DemoClassification;
  /** Declaración manual registrada, si la hay. */
  manualClassification: ManualClassificationInput | null;
  isDemoCampaign: boolean;
  protectedCampaign: boolean;
  ledgerMovements: ExpenseLedgerRef[];
  hasLedgerEntry: boolean;
  /** El asiento se puede retirar dejando la cadena de su campaña verificable. */
  chainVerifiedAfterRemoval: boolean;
  conservationObligation: boolean;
  action: ExpenseAction;
  actionLabel: string;
  /** ¿Se puede borrar de verdad? (el resto son bloqueos duros) */
  deletable: boolean;
  blockers: string[];
  reasons: string[];
}

/** Declaración manual del superadmin sobre un gasto (migración 029). */
export interface ManualClassificationInput {
  classification: "demo" | "real" | "pending";
  reason: string;
  evidence?: string | null;
  classifiedBy?: string | null;
  classifiedAt?: Date | string | null;
}

export interface ExpenseDiagnosisInput {
  expense: ExpenseRow;
  /** `null` si su campaña ya no existe. */
  campaign: ExpenseCampaignRow | null;
  classification: DemoClassification;
  protectedCampaignIds: readonly number[];
  /** TODOS los asientos de la campaña del gasto, ordenados por id. */
  campaignMovements: readonly ExpenseMovementRow[];
  /**
   * Clasificación MANUAL persistente, si el superadmin ya se pronunció. Manda sobre
   * la deducida, pero NO sobre las protecciones objetivas (campaña protegida y
   * documento propio): una declaración no puede habilitar lo que la evidencia
   * prohíbe.
   */
  manualClassification?: ManualClassificationInput | null;
}

/** Asientos cuyo origen es este gasto. */
function movementsOfExpense(
  expenseId: number,
  movements: readonly ExpenseMovementRow[],
): ExpenseMovementRow[] {
  return movements.filter(
    (movement) =>
      movement.sourceType === "expense" && Number(movement.sourceId) === expenseId,
  );
}

/** ¿Algún asiento posterior engancha con este? (entonces no es el final de la cadena) */
function isTail(movementId: number, movements: readonly ExpenseMovementRow[]): boolean {
  const target = movements.find((movement) => movement.id === movementId);
  if (!target) return false;
  return !movements.some((other) => other.prevHash === target.hash && other.id !== target.id);
}

/**
 * Diagnostica UN gasto. Puro y determinista: mismas entradas → mismo veredicto.
 */
export function diagnoseExpense(input: ExpenseDiagnosisInput): ExpenseDiagnosis {
  const { expense, campaign, classification, campaignMovements } = input;
  const protectedCampaign = input.protectedCampaignIds.includes(expense.campaignId);
  const ledgerMovements = movementsOfExpense(expense.id, campaignMovements);
  const hasLedgerEntry = ledgerMovements.length > 0;

  // ¿La cadena sigue verificando si quitamos los asientos de este gasto?
  const toRemove = new Set(ledgerMovements.map((movement) => movement.id));
  const remaining = campaignMovements.filter((movement) => !toRemove.has(movement.id));
  const chainAfter = hasLedgerEntry ? verifyChain(remaining) : { verified: true };
  const chainVerifiedAfterRemoval = chainAfter.verified;

  const hasOwnDocument = isOwnDocument(expense.receiptUrl);
  const hasPlaceholderReceipt = isPlaceholderMedia(expense.receiptUrl);
  const isOrphan = campaign === null;
  const isDemoCampaign = campaign?.isDemo === true;
  // Obligación de conservación: solo un documento propio (una foto de relleno no
  // es un documento: el seed la usa incluso en Chocofest 2025).
  const conservationObligation = hasOwnDocument && !isDemoCampaign;

  const blockers: string[] = [];
  const reasons: string[] = [];
  const manual = input.manualClassification ?? null;

  // La declaración manual MANDA sobre la clasificación deducida, pero no sobre las
  // protecciones objetivas de abajo.
  const effectiveClassification: DemoClassification = manual
    ? manual.classification
    : classification;
  if (manual) {
    reasons.push(
      `Clasificación MANUAL «${CLASSIFICATION_LABEL[manual.classification]}» por ${
        manual.classifiedBy ?? "el superadmin"
      }: ${manual.reason}${manual.evidence ? ` (evidencia: ${manual.evidence})` : ""}.`,
    );
  }

  if (isOrphan && !manual) {
    reasons.push(
      "Su campaña ya no existe y nadie lo ha clasificado todavía: no hay declaración que lo respalde.",
    );
    return finish("review", false, ["orphan_expense"], reasons);
  }

  // Protección de ChocoFest: una declaración manual NO la levanta.
  if (protectedCampaign) {
    reasons.push("Pertenece a una campaña PROTEGIDA (ChocoFest): se conserva.");
    return finish("review", false, ["protected_campaign"], reasons);
  }

  if (isOrphan && manual) {
    reasons.push("Gasto huérfano (su campaña ya no existe) con clasificación manual registrada.");
  }
  if (isDemoCampaign) {
    reasons.push("Pertenece a una campaña DECLARADA DEMO por el superadmin.");
  }
  if (classification === "demo" && !isOrphan) {
    reasons.push("Clasificado DEMO confirmado en el inventario.");
  }
  if (hasPlaceholderReceipt) {
    reasons.push("Su comprobante es un medio de RELLENO: no es un documento a conservar.");
  }

  // ─── Real: no se destruye, se corrige o se anula ───────────────────────────
  if (effectiveClassification === "real" || conservationObligation) {
    if (hasOwnDocument) {
      reasons.push(
        "Tiene un documento propio: existe obligación de conservación y no se destruye aunque se declare DEMO.",
      );
    }
    if (hasLedgerEntry) {
      reasons.push("Está contabilizado: se anula con un asiento compensatorio, sin borrar el histórico.");
      return finish("annul", false, ["real_expense_counted"], reasons);
    }
    reasons.push("Es real y le falta el asiento: se corrige autorizando su registro contable.");
    return finish("regularize", false, ["real_expense_without_entry"], reasons);
  }

  // ─── Ficticio ──────────────────────────────────────────────────────────────
  if (effectiveClassification !== "demo") {
    reasons.push(
      isOrphan
        ? "Huérfano sin clasificar como DEMO: hace falta la declaración manual del superadmin."
        : "Ni es de una campaña declarada DEMO ni lleva firma de relleno: hace falta una decisión humana.",
    );
    return finish("review", false, [isOrphan ? "orphan_unclassified" : "not_confirmed_demo"], reasons);
  }

  if (!hasLedgerEntry) {
    reasons.push("No tiene asiento en el libro: eliminarlo no toca la contabilidad.");
    return finish("delete", true, [], reasons);
  }

  if (!chainVerifiedAfterRemoval) {
    reasons.push(
      `Tiene ${ledgerMovements.length} asiento(s) y NO es el último de la cadena de su campaña: retirarlo rompería los hashes siguientes.`,
    );
    return finish("review", false, ["ledger_movement_not_tail"], reasons);
  }

  reasons.push(
    `Tiene ${ledgerMovements.length} asiento(s) de PRUEBA y es el último de la cadena: retirarlo la deja verificable.`,
  );
  return finish("purge_with_ledger", true, [], reasons);

  function finish(
    action: ExpenseAction,
    deletable: boolean,
    extraBlockers: string[],
    extraReasons: string[],
  ): ExpenseDiagnosis {
    return {
      id: expense.id,
      campaignId: expense.campaignId,
      campaignTitle: campaign?.title ?? "(campaña inexistente)",
      campaignStatus: campaign?.status ?? null,
      campaignExists: campaign !== null,
      isOrphan,
      description: expense.description,
      amount: expense.amount,
      date: expense.date,
      category: expense.category,
      receiptUrl: expense.receiptUrl,
      hasOwnDocument,
      hasPlaceholderReceipt,
      classification: effectiveClassification,
      classificationLabel: CLASSIFICATION_LABEL[effectiveClassification],
      computedClassification: classification,
      manualClassification: manual,
      isDemoCampaign,
      protectedCampaign,
      ledgerMovements: ledgerMovements.map((movement) => ({
        id: movement.id,
        kind: movement.kind,
        amount: movement.amount,
        sourceType: movement.sourceType,
        sourceId: Number(movement.sourceId),
        isTail: isTail(movement.id, campaignMovements),
      })),
      hasLedgerEntry,
      chainVerifiedAfterRemoval,
      conservationObligation,
      action,
      actionLabel: EXPENSE_ACTION_LABEL[action],
      deletable,
      blockers: extraBlockers,
      reasons: extraReasons,
    };
  }
}

export interface ExpensePurgePlan {
  deletable: ExpenseDiagnosis[];
  blocked: ExpenseDiagnosis[];
  /** Asientos que se retirarán (solo de los gastos autorizados). */
  movementIdsToDelete: number[];
  totals: {
    expenses: number;
    amount: number;
    movements: number;
    byCampaign: { campaignId: number; campaignTitle: string; count: number; amount: number }[];
  };
}

/** Plan de purga de un lote: qué se borra, qué se bloquea y cuánto suma. */
export function planExpensePurge(diagnoses: readonly ExpenseDiagnosis[]): ExpensePurgePlan {
  const deletable = diagnoses.filter((diagnosis) => diagnosis.deletable);
  const blocked = diagnoses.filter((diagnosis) => !diagnosis.deletable);
  const movementIdsToDelete = [
    ...new Set(deletable.flatMap((diagnosis) => diagnosis.ledgerMovements.map((m) => m.id))),
  ];

  const byCampaignMap = new Map<number, { campaignId: number; campaignTitle: string; count: number; amount: number }>();
  for (const diagnosis of deletable) {
    const entry = byCampaignMap.get(diagnosis.campaignId) ?? {
      campaignId: diagnosis.campaignId,
      campaignTitle: diagnosis.campaignTitle,
      count: 0,
      amount: 0,
    };
    entry.count += 1;
    entry.amount = Math.round((entry.amount + diagnosis.amount) * 100) / 100;
    byCampaignMap.set(diagnosis.campaignId, entry);
  }

  return {
    deletable,
    blocked,
    movementIdsToDelete,
    totals: {
      expenses: deletable.length,
      amount:
        Math.round(deletable.reduce((sum, diagnosis) => sum + diagnosis.amount, 0) * 100) / 100,
      movements: movementIdsToDelete.length,
      byCampaign: [...byCampaignMap.values()].sort((a, b) => a.campaignId - b.campaignId),
    },
  };
}

/** Resumen de la tabla de gastos para la cabecera de la página. */
export interface ExpenseTableSummary {
  total: number;
  totalAmount: number;
  byAction: Record<ExpenseAction, { count: number; amount: number }>;
  byClassification: Record<DemoClassification, { count: number; amount: number }>;
  deletableCount: number;
  deletableAmount: number;
  orphans: number;
  withLedger: number;
}

export function summarizeExpenses(diagnoses: readonly ExpenseDiagnosis[]): ExpenseTableSummary {
  const byAction = Object.fromEntries(
    EXPENSE_ACTIONS.map((action) => [action, { count: 0, amount: 0 }]),
  ) as Record<ExpenseAction, { count: number; amount: number }>;
  const byClassification = Object.fromEntries(
    (["real", "demo", "pending", "protected"] as DemoClassification[]).map((key) => [
      key,
      { count: 0, amount: 0 },
    ]),
  ) as Record<DemoClassification, { count: number; amount: number }>;

  for (const diagnosis of diagnoses) {
    byAction[diagnosis.action].count += 1;
    byAction[diagnosis.action].amount =
      Math.round((byAction[diagnosis.action].amount + diagnosis.amount) * 100) / 100;
    byClassification[diagnosis.classification].count += 1;
    byClassification[diagnosis.classification].amount =
      Math.round((byClassification[diagnosis.classification].amount + diagnosis.amount) * 100) / 100;
  }

  const deletable = diagnoses.filter((diagnosis) => diagnosis.deletable);
  return {
    total: diagnoses.length,
    totalAmount:
      Math.round(diagnoses.reduce((sum, diagnosis) => sum + diagnosis.amount, 0) * 100) / 100,
    byAction,
    byClassification,
    deletableCount: deletable.length,
    deletableAmount:
      Math.round(deletable.reduce((sum, diagnosis) => sum + diagnosis.amount, 0) * 100) / 100,
    orphans: diagnoses.filter((diagnosis) => diagnosis.isOrphan).length,
    withLedger: diagnoses.filter((diagnosis) => diagnosis.hasLedgerEntry).length,
  };
}

// ─── Comprobación financiera ANTES → DESPUÉS (Fase 7) ────────────────────────

export interface FinancialSnapshot {
  generatedAt: string;
  expensesCount: number;
  expensesTotal: number;
  donationsCount: number;
  donationsTotal: number;
  balance: number;
  movementsCount: number;
  discrepancies: number;
  chainsVerified: boolean;
  brokenChains: number[];
}

export interface FinancialComparison {
  before: FinancialSnapshot;
  after: FinancialSnapshot;
  delta: {
    expensesCount: number;
    expensesTotal: number;
    donationsCount: number;
    donationsTotal: number;
    balance: number;
    movementsCount: number;
  };
  /** ¿La variación coincide EXACTAMENTE con lo que se purgó? */
  matchesPurged: boolean;
  expected: { expensesCount: number; expensesTotal: number; movementsCount: number };
}

/**
 * Compara dos instantáneas. La variación de gastos y de asientos debe coincidir
 * exactamente con lo purgado: si no, es que la purga tocó algo que no debía.
 */
export function compareFinancialSnapshots(
  before: FinancialSnapshot,
  after: FinancialSnapshot,
  purged: { expensesCount: number; expensesTotal: number; movementsCount: number },
): FinancialComparison {
  const delta = {
    expensesCount: after.expensesCount - before.expensesCount,
    expensesTotal: Math.round((after.expensesTotal - before.expensesTotal) * 100) / 100,
    donationsCount: after.donationsCount - before.donationsCount,
    donationsTotal: Math.round((after.donationsTotal - before.donationsTotal) * 100) / 100,
    balance: Math.round((after.balance - before.balance) * 100) / 100,
    movementsCount: after.movementsCount - before.movementsCount,
  };
  return {
    before,
    after,
    delta,
    expected: purged,
    matchesPurged:
      delta.expensesCount === -purged.expensesCount &&
      Math.abs(delta.expensesTotal + purged.expensesTotal) < 0.005 &&
      delta.movementsCount === -purged.movementsCount,
  };
}

import { roundMoney } from "./funding";

/**
 * Regularización de GASTOS REALES sin asiento (V16) — FUNCIONES PURAS.
 *
 * Responde a dos preguntas por cada gasto, sin tocar la base:
 *
 *   1. ¿Cuál es su RELACIÓN real con el libro contable? No basta con «tiene o no
 *      tiene asiento»: el asiento puede existir pero estar en OTRA campaña, con
 *      OTRO importe, DUPLICADO o con el tipo cambiado. Confundir «falta el
 *      asiento» con «el asiento está mal» llevaría a escribir uno nuevo encima de
 *      uno existente.
 *   2. ¿Se puede REGULARIZAR (crear el asiento que falta)? Solo los gastos
 *      confirmados como REALES y sin ningún asiento. Un gasto DEMO o pendiente
 *      NUNCA se regulariza por esta vía: no se convierten ficticios en reales.
 *
 * El libro es APPEND-ONLY: regularizar APILA un asiento nuevo, nunca edita ni
 * borra el historial. El índice único `(source_type, source_id)` de la base es la
 * guarda final contra duplicados.
 *
 * Módulo PURO y SIN DEPENDENCIAS de red/DB (se compila para `node:test`).
 */

export const EXPENSE_LEDGER_RELATIONS = [
  "missing",
  "ok",
  "wrong_campaign",
  "amount_mismatch",
  "duplicate",
  "wrong_kind",
] as const;
export type ExpenseLedgerRelation = (typeof EXPENSE_LEDGER_RELATIONS)[number];

export const EXPENSE_LEDGER_RELATION_LABEL: Record<ExpenseLedgerRelation, string> = {
  missing: "Sin asiento en el libro",
  ok: "Asiento correcto",
  wrong_campaign: "Asiento en OTRA campaña",
  amount_mismatch: "Asiento con importe distinto",
  duplicate: "Asiento DUPLICADO",
  wrong_kind: "Asiento con tipo incorrecto",
};

/** Asiento del libro con lo mínimo para juzgar la relación con un gasto. */
export interface ExpenseMovementLike {
  id: number;
  campaignId: number;
  kind: string;
  amount: number;
  sourceType: string;
  sourceId: number;
}

/** Gasto con lo mínimo para juzgar la relación con el libro. */
export interface ExpenseRelationSubject {
  id: number;
  campaignId: number;
  amount: number;
}

export interface ExpenseLedgerRelationResult {
  status: ExpenseLedgerRelation;
  label: string;
  message: string;
  movementIds: number[];
}

/** Tolerancia monetaria: por debajo de medio céntimo son el mismo importe. */
const TOLERANCE = 0.005;

/** Asientos cuyo origen es este gasto (`source_type = 'expense'`). */
export function movementsOfExpense(
  expenseId: number,
  movements: readonly ExpenseMovementLike[],
): ExpenseMovementLike[] {
  return movements.filter(
    (movement) =>
      movement.sourceType === "expense" && Number(movement.sourceId) === expenseId,
  );
}

function relationResult(
  status: ExpenseLedgerRelation,
  message: string,
  movementIds: number[],
): ExpenseLedgerRelationResult {
  return { status, label: EXPENSE_LEDGER_RELATION_LABEL[status], message, movementIds };
}

/**
 * Clasifica la relación entre un gasto y sus asientos. Determinista.
 *
 * El orden importa: primero se descartan los casos que impiden regularizar
 * (duplicado, otra campaña, importe distinto) y solo si todo coincide se declara
 * `ok`.
 */
export function classifyExpenseLedgerRelation(
  expense: ExpenseRelationSubject,
  movements: readonly ExpenseMovementLike[],
): ExpenseLedgerRelationResult {
  const mine = movementsOfExpense(expense.id, movements);

  if (mine.length === 0) {
    return relationResult(
      "missing",
      "El gasto no tiene ningún asiento en el libro: falta su registro contable.",
      [],
    );
  }

  if (mine.length > 1) {
    const ids = mine.map((movement) => movement.id);
    return relationResult(
      "duplicate",
      `El gasto tiene ${mine.length} asientos (${ids
        .map((id) => `#${id}`)
        .join(", ")}): hay que decidir cuál sobra antes de tocar nada.`,
      ids,
    );
  }

  const movement = mine[0];

  if (movement.campaignId !== expense.campaignId) {
    return relationResult(
      "wrong_campaign",
      `Su asiento #${movement.id} está en la campaña ${movement.campaignId}, no en la ${expense.campaignId} del gasto.`,
      [movement.id],
    );
  }

  if (Math.abs(roundMoney(movement.amount) - roundMoney(expense.amount)) > TOLERANCE) {
    return relationResult(
      "amount_mismatch",
      `Su asiento #${movement.id} registra ${roundMoney(movement.amount).toFixed(2)} pero el gasto es ${roundMoney(
        expense.amount,
      ).toFixed(2)}.`,
      [movement.id],
    );
  }

  if (movement.kind !== "gasto") {
    return relationResult(
      "wrong_kind",
      `Su asiento #${movement.id} es «${movement.kind}» y debería ser «gasto».`,
      [movement.id],
    );
  }

  return relationResult(
    "ok",
    `Asiento #${movement.id} correcto: importe, campaña y tipo coinciden.`,
    [movement.id],
  );
}

/** Gasto candidato a regularización (datos que el plan necesita). */
export interface RegularizationCandidate {
  id: number;
  campaignId: number;
  campaignExists: boolean;
  amount: number;
  description: string;
  /** Clasificación EFECTIVA: la declaración manual manda sobre la deducida. */
  classification: string;
  /** Fecha de creación original del gasto, para conservar la cronología. */
  createdAt: Date | string | null;
}

export interface ExpenseRegularizationEntry {
  expenseId: number;
  campaignId: number;
  amount: number;
  description: string;
  createdAt: Date | string | null;
}

export interface SkippedExpense {
  id: number;
  amount: number;
  reason: string;
}

export interface ExpenseRegularizationPlan {
  /** Asientos que se APILARÁN (uno por gasto real sin asiento). */
  entries: ExpenseRegularizationEntry[];
  /** Gastos que NO se regularizan, con el motivo. */
  skipped: SkippedExpense[];
  total: number;
  amount: number;
  /** Relación con el libro de CADA candidato (responde a «¿falta o está mal?»). */
  relations: Record<number, ExpenseLedgerRelationResult>;
}

/**
 * Plan de regularización: por cada gasto confirmado REAL y SIN asiento propone un
 * `gasto` cuyo origen es el propio gasto. Los DEMO, pendientes, huérfanos y los
 * que ya tienen un asiento (o una relación incorrecta) quedan fuera con su motivo.
 */
export function planExpenseRegularization(
  candidates: readonly RegularizationCandidate[],
  movements: readonly ExpenseMovementLike[],
): ExpenseRegularizationPlan {
  const entries: ExpenseRegularizationEntry[] = [];
  const skipped: SkippedExpense[] = [];
  const relations: Record<number, ExpenseLedgerRelationResult> = {};

  for (const candidate of candidates) {
    const relation = classifyExpenseLedgerRelation(
      { id: candidate.id, campaignId: candidate.campaignId, amount: candidate.amount },
      movements,
    );
    relations[candidate.id] = relation;

    const amount = roundMoney(candidate.amount);

    // PUNTO CLAVE: solo gastos REALES CONFIRMADOS. Un gasto DEMO o pendiente no se
    // regulariza nunca por esta vía (no se convierten ficticios en reales).
    if (candidate.classification !== "real") {
      skipped.push({
        id: candidate.id,
        amount,
        reason: "No está confirmado como gasto REAL: no se regulariza automáticamente.",
      });
      continue;
    }

    if (!candidate.campaignExists) {
      skipped.push({
        id: candidate.id,
        amount,
        reason: "Su campaña ya no existe: no hay libro donde registrarlo.",
      });
      continue;
    }

    if (relation.status !== "missing") {
      skipped.push({
        id: candidate.id,
        amount,
        reason: `No se regulariza: ${relation.message}`,
      });
      continue;
    }

    entries.push({
      expenseId: candidate.id,
      campaignId: candidate.campaignId,
      amount,
      description: `Regularización: asiento faltante del gasto #${candidate.id} (${candidate.description})`,
      createdAt: candidate.createdAt,
    });
  }

  return {
    entries,
    skipped,
    total: entries.length,
    amount: roundMoney(entries.reduce((sum, entry) => sum + entry.amount, 0)),
    relations,
  };
}

export const MIN_REGULARIZATION_REASON = 10;

export interface ExpenseRegularizationRequest {
  expenseIds: number[];
  reason: string;
  evidenceRef: string;
}

export type ExpenseRegularizationValidation =
  | { ok: true; value: ExpenseRegularizationRequest }
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
 * Valida la solicitud de regularización. Exige confirmación explícita, al menos un
 * gasto, un motivo escrito suficientemente descriptivo y una referencia de
 * evidencia documental (ambos quedan en la auditoría).
 */
export function validateExpenseRegularizationRequest(
  body: unknown,
): ExpenseRegularizationValidation {
  const source = (body ?? {}) as Record<string, unknown>;

  if (source.confirm !== true) {
    return {
      ok: false,
      message:
        "La regularización exige confirmación explícita (confirm: true). No modifica el historial: apila el asiento que falta.",
    };
  }

  const expenseIds = toPositiveIntArray(source.expenseIds);
  if (expenseIds === null || expenseIds.length === 0) {
    return {
      ok: false,
      message:
        "Indica al menos un gasto a regularizar (expenseIds con identificadores válidos).",
    };
  }

  const reason = typeof source.reason === "string" ? source.reason.trim() : "";
  if (reason.length < MIN_REGULARIZATION_REASON) {
    return {
      ok: false,
      message: `Indica el motivo de la regularización (mínimo ${MIN_REGULARIZATION_REASON} caracteres). Queda registrado en la auditoría.`,
    };
  }

  const evidenceRef = typeof source.evidenceRef === "string" ? source.evidenceRef.trim() : "";
  if (evidenceRef.length === 0) {
    return {
      ok: false,
      message:
        "Adjunta una referencia de evidencia documental (nº de boleta, voucher o informe) que respalde la regularización.",
    };
  }

  return { ok: true, value: { expenseIds, reason, evidenceRef } };
}

// ─── Verificación de totales (V16): regularizar NO altera las cifras ─────────

export interface ExpenseTotalsSnapshot {
  expensesCount: number;
  expensesTotal: number;
  donationsTotal: number;
  balance: number;
  movementsCount: number;
}

export interface RegularizationTotalsCheck {
  ok: boolean;
  delta: {
    expensesCount: number;
    expensesTotal: number;
    donationsTotal: number;
    balance: number;
    movementsCount: number;
  };
  problems: string[];
}

/**
 * Comprueba que regularizar solo AÑADIÓ asientos: el número y el total de gastos,
 * el total de donaciones y el saldo deben quedar EXACTAMENTE iguales, y el número
 * de asientos debe subir justo lo esperado. Si algo más cambió, es que la
 * operación tocó algo que no debía y hay que avisar.
 */
export function verifyRegularizationTotals(
  before: ExpenseTotalsSnapshot,
  after: ExpenseTotalsSnapshot,
  expectedMovements: number,
): RegularizationTotalsCheck {
  const delta = {
    expensesCount: after.expensesCount - before.expensesCount,
    expensesTotal: roundMoney(after.expensesTotal - before.expensesTotal),
    donationsTotal: roundMoney(after.donationsTotal - before.donationsTotal),
    balance: roundMoney(after.balance - before.balance),
    movementsCount: after.movementsCount - before.movementsCount,
  };

  const problems: string[] = [];
  if (delta.expensesCount !== 0) {
    problems.push(`El número de gastos cambió (${delta.expensesCount}).`);
  }
  if (Math.abs(delta.expensesTotal) > 0.005) {
    problems.push(`El total de gastos cambió (${delta.expensesTotal}).`);
  }
  if (Math.abs(delta.donationsTotal) > 0.005) {
    problems.push(`El total de donaciones cambió (${delta.donationsTotal}).`);
  }
  if (Math.abs(delta.balance) > 0.005) {
    problems.push(`El saldo cambió (${delta.balance}).`);
  }
  if (delta.movementsCount !== expectedMovements) {
    problems.push(
      `Los asientos creados (${delta.movementsCount}) no coinciden con los esperados (${expectedMovements}).`,
    );
  }

  return { ok: problems.length === 0, delta, problems };
}

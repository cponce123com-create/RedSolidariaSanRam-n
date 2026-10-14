/**
 * Presupuesto por categoría (Fase 2.5 del Prompt Maestro).
 *
 * Responde a tres preguntas con UNA sola fuente de verdad por cifra:
 *   - ¿Cuánto teníamos previsto por rubro?  → `campaign_budgets.planned_amount`
 *   - ¿Cuánto llevamos gastado por rubro?    → `campaign_expenses.amount`
 *   - ¿Cuánto falta?                         → derivado aquí (nunca se guarda)
 *
 * El gasto NO se duplica en la tabla de presupuesto: se cruza por categoría.
 * La comparación ignora mayúsculas, acentos y espacios sobrantes, y todo gasto
 * cuya categoría no tenga partida aparece en una fila «Sin presupuesto
 * asignado»: así ningún gasto queda oculto.
 *
 * Funciones PURAS y testeables (las usan el panel y la página pública).
 */

import { goalProgress, type GoalProgress } from "@/lib/inventory";

export interface BudgetLine {
  id: number;
  campaignId: number;
  category: string;
  plannedAmount: number;
  notes?: string | null;
  isPublic: boolean;
}

export interface ExpenseLike {
  category?: string | null;
  amount: number;
}

/** Clave de comparación: sin mayúsculas, sin acentos, sin espacios de sobra. */
export function categoryKey(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

/** Clave de la fila sintética que agrupa los gastos sin partida. */
export const UNBUDGETED_KEY = "__sin_presupuesto__";

export const UNBUDGETED_LABEL = "Sin presupuesto asignado";

export interface BudgetRow {
  /** Clave de comparación (categoría normalizada o la sintética). */
  key: string;
  category: string;
  /** Id de la partida (ausente en la fila de gastos sin presupuesto). */
  id?: number;
  planned: number;
  spent: number;
  /** `planned - spent`; negativo significa excedido. */
  remaining: number;
  exceeded: boolean;
  /** Avance del gasto frente a la partida (`hasTarget: false` si no hay partida). */
  progress: GoalProgress;
  notes?: string | null;
  /** Partida privada (solo visible en el panel). */
  isPublic: boolean;
}

export interface BudgetTotals {
  planned: number;
  spent: number;
  remaining: number;
  /** Gasto en categorías sin partida presupuestada. */
  unbudgetedSpent: number;
  /** Cuántas partidas se han excedido. */
  exceededRows: number;
}

export interface BudgetOverview {
  rows: BudgetRow[];
  totals: BudgetTotals;
}

function toAmount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/**
 * Cruza las partidas presupuestadas con los gastos reales.
 * Las filas se ordenan por monto previsto (mayor primero) y los gastos sin
 * partida van al final, para que se vean y se puedan presupuestar.
 */
export function buildBudget(
  lines: readonly BudgetLine[] | undefined | null,
  expenses: readonly ExpenseLike[] | undefined | null,
): BudgetOverview {
  const spentByKey = new Map<string, number>();
  for (const expense of expenses ?? []) {
    const key = categoryKey(expense.category);
    spentByKey.set(key, (spentByKey.get(key) ?? 0) + toAmount(expense.amount));
  }

  const usedKeys = new Set<string>();
  const rows: BudgetRow[] = (lines ?? []).map((line) => {
    const key = categoryKey(line.category);
    usedKeys.add(key);
    const planned = toAmount(line.plannedAmount);
    const spent = spentByKey.get(key) ?? 0;
    return {
      key,
      id: line.id,
      category: line.category,
      planned,
      spent,
      remaining: planned - spent,
      exceeded: planned > 0 && spent > planned,
      progress: goalProgress(planned, spent),
      notes: line.notes ?? null,
      isPublic: line.isPublic !== false,
    };
  });

  // Gastos cuya categoría no tiene partida: se muestran, no se esconden.
  let unbudgetedSpent = 0;
  for (const [key, spent] of spentByKey) {
    if (!usedKeys.has(key)) unbudgetedSpent += spent;
  }
  if (unbudgetedSpent > 0) {
    rows.push({
      key: UNBUDGETED_KEY,
      category: UNBUDGETED_LABEL,
      planned: 0,
      spent: unbudgetedSpent,
      remaining: -unbudgetedSpent,
      exceeded: false,
      progress: goalProgress(0, unbudgetedSpent),
      notes: null,
      isPublic: true,
    });
  }

  rows.sort((a, b) => {
    if (a.key === UNBUDGETED_KEY) return 1;
    if (b.key === UNBUDGETED_KEY) return -1;
    return b.planned - a.planned;
  });

  const planned = rows.reduce((sum, r) => sum + r.planned, 0);
  const spent = rows.reduce((sum, r) => sum + r.spent, 0);

  return {
    rows,
    totals: {
      planned,
      spent,
      remaining: planned - spent,
      unbudgetedSpent,
      exceededRows: rows.filter((r) => r.exceeded).length,
    },
  };
}

export interface CampaignBalance {
  /** Donaciones confirmadas (approved/reconciled). */
  raised: number;
  /** Gastos aprobados registrados. */
  spent: number;
  /** `raised - spent`. */
  balance: number;
  /** Avance de la meta monetaria de la campaña. */
  goalProgress: GoalProgress;
}

/**
 * Saldo general de la campaña y avance frente a la meta de recaudación.
 * Si no hay meta definida, `goalProgress.hasTarget` es `false` y la interfaz
 * debe mostrar «sin meta definida» en lugar de un porcentaje inventado.
 */
export function campaignBalance(
  raised: number,
  spent: number,
  goal: number | null | undefined,
): CampaignBalance {
  const raisedSafe = toAmount(raised);
  const spentSafe = toAmount(spent);
  return {
    raised: raisedSafe,
    spent: spentSafe,
    balance: raisedSafe - spentSafe,
    goalProgress: goalProgress(goal, raisedSafe),
  };
}

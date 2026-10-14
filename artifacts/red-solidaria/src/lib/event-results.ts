/**
 * Rendición de resultados del evento (Fase 4.3 del Prompt Maestro V7).
 *
 * El evento ya publica dinero (transparencia), bienes (inventario con flujo
 * recibido/entregado), presupuesto, programa y evidencias. Lo que faltaba es el
 * INFORME que lo reúne y los datos que solo la organización puede declarar:
 * beneficiarios atendidos (dato agregado), actividades realizadas, resumen de la
 * rendición y destino posterior de los recursos sobrantes.
 *
 * Reglas:
 *   - Las CIFRAS se calculan de los datos reales (nunca se escriben a mano):
 *     dinero de la transparencia y bienes con `resolveStock` (la misma regla que
 *     el inventario público).
 *   - Lo DECLARADO es opcional: si no se declaró, la interfaz debe decir «no
 *     declarado» en lugar de mostrar un cero que parecería un dato real.
 *   - No se suman bienes al dinero: son rendiciones distintas y separadas.
 *
 * Funciones PURAS y testeables (sin React ni red).
 */

import { parseProgram, type ProgramActivity } from "./chocofest";
import { resolveStock, type InventoryItem } from "./inventory";

export const RESULTS_SETTING_KEYS = {
  /** Beneficiarios atendidos (entero agregado). */
  beneficiaries: "chocofest_2026_results_beneficiaries",
  /** Actividades realizadas: una por línea, mismo formato que el programa. */
  activities: "chocofest_2026_results_activities",
  /** Resumen de la rendición de cuentas (texto libre). */
  summary: "chocofest_2026_results_summary",
  /** Destino posterior de los recursos sobrantes. */
  leftoversDestination: "chocofest_2026_results_leftovers_destination",
} as const;

export interface GoodsFlow {
  /** Líneas de inventario consideradas. */
  lines: number;
  /** Suma de cantidades recibidas (donadas o compradas). */
  received: number;
  /** Suma de cantidades entregadas o usadas. */
  distributed: number;
  /** Saldo que queda. Nunca negativo. */
  remaining: number;
}

/**
 * Flujo de bienes con la regla única del inventario (`resolveStock`): una fila
 * antigua sin flujo registrado cuenta como recibida y no entregada, que es lo
 * que su `quantity` significaba.
 */
export function summarizeGoodsFlow(
  items: readonly InventoryItem[] | undefined | null,
): GoodsFlow {
  const list = items ?? [];
  let received = 0;
  let distributed = 0;
  let remaining = 0;
  for (const item of list) {
    const stock = resolveStock(item);
    received += stock.received;
    distributed += stock.used;
    remaining += stock.remaining;
  }
  const round = (n: number) => Math.round(n * 100) / 100;
  return {
    lines: list.length,
    received: round(received),
    distributed: round(distributed),
    remaining: round(remaining),
  };
}

/**
 * Beneficiarios declarados: entero ≥ 0. Devuelve `null` si no se declaró o si lo
 * declarado no es un número utilizable (nunca se inventa un cero).
 */
export function parseBeneficiaries(raw: unknown): number | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const value = Number(trimmed.replace(/\./g, "").replace(/,/g, ""));
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value);
}

export interface EventResults {
  money: {
    income: number | null;
    spent: number | null;
    balance: number | null;
    /** true si hay cifras de dinero disponibles (transparencia cargada). */
    available: boolean;
  };
  goods: GoodsFlow;
  activities: {
    planned: number;
    done: number;
    /** Actividades realizadas ya interpretadas (mismo formato que el programa). */
    doneList: ProgramActivity[];
  };
  beneficiaries: number | null;
  summary: string;
  leftoversDestination: string;
  /** Hay algo que rendir: la página decide si muestra la sección. */
  hasAnything: boolean;
}

export interface AssembleEventResultsInput {
  /** Datos del panel de transparencia (ingresos, gastos y saldo conciliados). */
  transparency?: { totalRaised?: unknown; totalSpent?: unknown; balance?: unknown } | null;
  /** Bienes públicos del evento (inventario). */
  inventory?: readonly InventoryItem[] | null;
  /** Programa planificado (actividades previstas). */
  plannedActivities?: readonly ProgramActivity[] | null;
  /** Valores declarados por la organización (claves de `RESULTS_SETTING_KEYS`). */
  results?: Record<string, string | undefined> | null;
}

function toMoney(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

export function assembleEventResults({
  transparency,
  inventory,
  plannedActivities,
  results,
}: AssembleEventResultsInput): EventResults {
  const income = toMoney(transparency?.totalRaised);
  const spent = toMoney(transparency?.totalSpent);
  const balance = toMoney(transparency?.balance);
  const moneyAvailable = income !== null || spent !== null;

  const goods = summarizeGoodsFlow(inventory);

  const doneList = parseProgram(results?.[RESULTS_SETTING_KEYS.activities]);
  const planned = (plannedActivities ?? []).length;

  const beneficiaries = parseBeneficiaries(results?.[RESULTS_SETTING_KEYS.beneficiaries]);
  const summary = (results?.[RESULTS_SETTING_KEYS.summary] ?? "").trim();
  const leftoversDestination = (
    results?.[RESULTS_SETTING_KEYS.leftoversDestination] ?? ""
  ).trim();

  const hasAnything =
    moneyAvailable ||
    goods.lines > 0 ||
    planned > 0 ||
    doneList.length > 0 ||
    beneficiaries !== null ||
    summary.length > 0 ||
    leftoversDestination.length > 0;

  return {
    money: {
      income,
      spent,
      balance: balance ?? (income !== null && spent !== null ? income - spent : null),
      available: moneyAvailable,
    },
    goods,
    activities: { planned, done: doneList.length, doneList },
    beneficiaries,
    summary,
    leftoversDestination,
    hasAnything,
  };
}

/**
 * Inventario y bienes de una campaña (Fase 2 del Prompt Maestro).
 *
 * REUTILIZA `campaign_leftovers` (tabla genérica de bienes de campaña) como
 * almacén del inventario: chocolatada y raciones, juguetes, canastas de víveres
 * y otras donaciones en especie. No se crean tablas nuevas.
 *
 * La valorización estimada, si existe, es informativa y va en `notes`: NUNCA se
 * suma al dinero recaudado ni al libro contable (los bienes no son dinero).
 *
 * Todo lo de este módulo son FUNCIONES PURAS y testeables: la misma regla la
 * usan el panel y la página pública, así que no hay dos verdades distintas.
 */

/** Agrupaciones de bienes del evento (Fase 2.2–2.4). */
export const INVENTORY_CATEGORIES = [
  "chocolatada",
  "regalos",
  "canastas",
  "general",
] as const;

export type InventoryCategory = (typeof INVENTORY_CATEGORIES)[number];

export const INVENTORY_CATEGORY_LABEL: Record<InventoryCategory, string> = {
  chocolatada: "Chocolatada y raciones",
  regalos: "Regalos y juguetes",
  canastas: "Canastas de víveres",
  general: "Otros bienes",
};

export interface InventoryItem {
  id: number;
  item: string;
  quantity: number;
  unit?: string | null;
  notes?: string | null;
  /** Clasificación del bien (migración 015). Ausente en filas antiguas. */
  category?: string | null;
  /** Meta del producto (p. ej. 80 juguetes). Opcional. */
  targetQty?: number | null;
  /** Cantidad recibida; si está presente, manda el flujo recibido/usado. */
  receivedQty?: number | null;
  /** Cantidad usada o entregada. */
  usedQty?: number | null;
}

export interface InventorySummary {
  /** Número de líneas de inventario. */
  lines: number;
  /** Suma de cantidades (contador informativo). */
  totalQuantity: number;
  /** Líneas con meta definida. */
  withTarget: number;
  /** Líneas con flujo recibido/usado registrado. */
  withFlow: number;
}

/** Formatea una cantidad sin decimales innecesarios (3 → "3", 2.5 → "2.5"). */
export function formatQuantity(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
}

/** Texto "3 cajas" / "2" según haya unidad o no. */
export function formatItemAmount(
  item: Pick<InventoryItem, "quantity" | "unit">,
): string {
  const qty = formatQuantity(item.quantity ?? 0);
  const unit = typeof item.unit === "string" ? item.unit.trim() : "";
  return unit ? `${qty} ${unit}` : qty;
}

export interface StockView {
  /** Cantidad recibida (o el saldo actual si no hay flujo registrado). */
  received: number;
  /** Cantidad usada/entregada (0 si no hay flujo registrado). */
  used: number;
  /** Saldo disponible. Nunca negativo. */
  remaining: number;
  /**
   * `true` si la fila trae flujo recibido/usado registrado. `false` significa
   * fila antigua: solo se conoce el saldo (`quantity`).
   */
  hasFlow: boolean;
}

function toNumberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * REGLA ÚNICA del saldo de un bien.
 * - Con flujo registrado: `recibido - usado` (nunca por debajo de 0).
 * - Sin flujo (fila antigua): el propio `quantity`, que ya era el saldo.
 */
export function resolveStock(item: InventoryItem): StockView {
  const received = toNumberOrNull(item.receivedQty);
  const used = toNumberOrNull(item.usedQty);

  if (received !== null) {
    const usedSafe = Math.max(0, used ?? 0);
    return {
      received,
      used: usedSafe,
      remaining: Math.max(0, received - usedSafe),
      hasFlow: true,
    };
  }

  const quantity = Number.isFinite(item.quantity) ? Math.max(0, item.quantity) : 0;
  return { received: quantity, used: 0, remaining: quantity, hasFlow: false };
}

export interface GoalProgress {
  /** Meta (0 si no hay meta definida). */
  target: number;
  /** Avance actual. */
  current: number;
  /** Porcentaje 0-100 (0 si no hay meta). */
  percent: number;
  /** Cuánto falta para la meta (0 si ya se alcanzó). */
  missing: number;
  /** `true` si la meta existe y ya se alcanzó o superó. */
  reached: boolean;
  /** `true` si hay meta definida (> 0). */
  hasTarget: boolean;
}

/**
 * Avance de una meta SIN inventar cifras: si no hay meta definida devuelve
 * `hasTarget: false` y la interfaz debe mostrar «sin meta definida» en lugar de
 * un porcentaje inventado.
 */
export function goalProgress(
  target: number | null | undefined,
  current: number,
): GoalProgress {
  const targetSafe = toNumberOrNull(target) ?? 0;
  const currentSafe = Number.isFinite(current) ? Math.max(0, current) : 0;
  const hasTarget = targetSafe > 0;
  return {
    target: targetSafe,
    current: currentSafe,
    percent: hasTarget
      ? Math.min(100, Math.round((currentSafe / targetSafe) * 100))
      : 0,
    missing: hasTarget ? Math.max(0, targetSafe - currentSafe) : 0,
    reached: hasTarget && currentSafe >= targetSafe,
    hasTarget,
  };
}

/**
 * Resumen verificable del inventario (contadores públicos).
 * El total usa el SALDO (`resolveStock`), no la columna cruda: si una fila tiene
 * flujo registrado, `quantity` puede estar desactualizado y no debe contarse.
 */
export function summarizeInventory(
  items: readonly InventoryItem[] | undefined | null,
): InventorySummary {
  const list = items ?? [];
  return {
    lines: list.length,
    totalQuantity: list.reduce((sum, i) => sum + resolveStock(i).remaining, 0),
    withTarget: list.filter((i) => (toNumberOrNull(i.targetQty) ?? 0) > 0).length,
    withFlow: list.filter((i) => toNumberOrNull(i.receivedQty) !== null).length,
  };
}

/** Normaliza una categoría desconocida a "general" (nunca lanza). */
export function normalizeCategory(value: unknown): InventoryCategory {
  return typeof value === "string" &&
    (INVENTORY_CATEGORIES as readonly string[]).includes(value)
    ? (value as InventoryCategory)
    : "general";
}

export interface InventoryGroup {
  category: InventoryCategory;
  label: string;
  items: InventoryItem[];
  summary: InventorySummary;
}

/**
 * Agrupa los bienes por categoría en el ORDEN de `INVENTORY_CATEGORIES`
 * (chocolatada, regalos, canastas, general). Las categorías sin bienes no se
 * devuelven: la interfaz decide si muestra el hueco.
 */
export function groupInventoryByCategory(
  items: readonly InventoryItem[] | undefined | null,
): InventoryGroup[] {
  const list = items ?? [];
  return INVENTORY_CATEGORIES.map((category) => {
    const groupItems = list.filter((i) => normalizeCategory(i.category) === category);
    return {
      category,
      label: INVENTORY_CATEGORY_LABEL[category],
      items: groupItems,
      summary: summarizeInventory(groupItems),
    };
  }).filter((group) => group.items.length > 0);
}

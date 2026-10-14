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
 * Todo lo de este módulo son FUNCIONES PURAS y testeables.
 */

export interface InventoryItem {
  id: number;
  item: string;
  quantity: number;
  unit?: string | null;
  notes?: string | null;
}

export interface InventorySummary {
  /** Número de líneas de inventario. */
  lines: number;
  /** Suma de cantidades (contador informativo). */
  totalQuantity: number;
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

/** Resumen verificable del inventario (contadores públicos). */
export function summarizeInventory(
  items: readonly InventoryItem[] | undefined | null,
): InventorySummary {
  const list = items ?? [];
  return {
    lines: list.length,
    totalQuantity: list.reduce(
      (sum, i) => sum + (Number.isFinite(i.quantity) ? i.quantity : 0),
      0,
    ),
  };
}

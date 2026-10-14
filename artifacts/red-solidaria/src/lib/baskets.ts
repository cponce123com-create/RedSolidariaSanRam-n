/**
 * Composición y cobertura de canastas (Fase 2.4 del Prompt Maestro).
 *
 * Dos preguntas que antes no tenían respuesta:
 *   1. ¿Qué lleva cada canasta?  → `composition` de la fila de bien (categoría
 *      `canastas`), como texto `producto | cantidad unidad`.
 *   2. ¿Cuántas canastas completas puedo armar HOY con lo que tengo? →
 *      `basketCoverage`, cruzando la composición con el stock real de bienes.
 *
 * La cobertura es la cifra honesta: si falta arroz se arman 0 canastas aunque
 * haya 200 juguetes. Además marca QUÉ insumo es el limitante, que es justo lo
 * que la organización necesita para pedir lo que falta.
 *
 * Todo son FUNCIONES PURAS (las usan el panel y la página pública). El stock de
 * cada insumo se calcula con `resolveStock` (recibido − usado) y los nombres se
 * comparan con `categoryKey` (sin mayúsculas, acentos ni espacios de sobra).
 */

import { categoryKey } from "@/lib/budget";
import { resolveStock, type InventoryItem } from "@/lib/inventory";

export interface BasketIngredient {
  /** Nombre del producto tal como lo escribió el panel. */
  name: string;
  /** Cantidad por canasta. */
  quantity: number;
  /** Unidad ("kg", "unidad", "paquete"). Vacío si no se indicó. */
  unit: string;
}

const MAX_INGREDIENTS = 30;
const MAX_NAME = 80;
const MAX_UNIT = 20;
const MAX_QUANTITY = 10_000;

/** Salto de línea explícito (evita secuencias escapadas dentro de literales). */
const NL = String.fromCharCode(10);
/** Salto de línea de Windows, para tolerar archivos con CRLF. */
const CR = String.fromCharCode(13);
const LINE_BREAK = new RegExp(`[${CR}${NL}]`);

function clean(value: string, max: number): string {
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

/**
 * Interpreta la composición guardada (una línea por producto:
 * `producto | cantidad unidad`). Tolerante: nunca lanza, ignora líneas vacías y
 * comentarios (`#`), y descarta las que no traigan nombre o cantidad válida.
 */
export function parseComposition(
  raw: string | null | undefined,
): BasketIngredient[] {
  if (typeof raw !== "string" || !raw.trim()) return [];

  const ingredients: BasketIngredient[] = [];
  for (const line of raw.split(LINE_BREAK)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const [rawName = "", rawAmount = ""] = trimmed.split("|");
    const name = clean(rawName, MAX_NAME);
    if (!name) continue;

    // "2 kg" / "2" / "2,5 kg" → cantidad + unidad.
    const amount = clean(rawAmount, MAX_UNIT + 12).replace(",", ".");
    const match = /^(\d+(?:\.\d+)?)\s*(.*)$/.exec(amount);
    const quantity = match ? Number(match[1]) : 0;
    if (!Number.isFinite(quantity) || quantity <= 0) continue;

    ingredients.push({
      name,
      quantity: Math.min(quantity, MAX_QUANTITY),
      unit: match ? clean(match[2] ?? "", MAX_UNIT) : "",
    });
    if (ingredients.length >= MAX_INGREDIENTS) break;
  }
  return ingredients;
}

/** Vuelve a texto lo que edita el panel (una línea por producto). */
export function serializeComposition(
  ingredients: readonly BasketIngredient[] | undefined | null,
): string {
  return (ingredients ?? [])
    .map((ingredient) => {
      const name = clean(ingredient.name, MAX_NAME);
      if (!name || !Number.isFinite(ingredient.quantity) || ingredient.quantity <= 0) {
        return "";
      }
      const unit = clean(ingredient.unit ?? "", MAX_UNIT);
      return `${name} | ${ingredient.quantity}${unit ? ` ${unit}` : ""}`;
    })
    .filter(Boolean)
    .join(NL);
}

export interface IngredientCoverage {
  name: string;
  /** Cantidad necesaria por canasta. */
  perBasket: number;
  unit: string;
  /** Stock disponible del insumo (0 si no hay ninguna fila que coincida). */
  available: number;
  /** Cuántas canastas completas permite este insumo. */
  basketsFromIt: number;
  /** Hay stock registrado para este insumo. */
  inStock: boolean;
}

export interface BasketCoverage {
  /** Canastas COMPLETAS que se pueden armar con el stock actual. */
  baskets: number;
  /** Insumo que limita (el más escaso). `null` si no hay composición. */
  limitedBy: string | null;
  /** Detalle por insumo, en el orden de la composición. */
  ingredients: IngredientCoverage[];
  /** `true` si hay composición definida. */
  hasComposition: boolean;
}

/**
 * Cruza la composición con el stock real y devuelve cuántas canastas completas
 * se pueden armar, indicando el insumo limitante.
 *
 * Si falta un insumo (ninguna fila de bienes coincide), la cobertura es 0: es
 * preferible decir la verdad que prometer canastas incompletas.
 */
export function basketCoverage(
  composition: readonly BasketIngredient[] | undefined | null,
  items: readonly InventoryItem[] | undefined | null,
): BasketCoverage {
  const list = composition ?? [];
  if (list.length === 0) {
    return { baskets: 0, limitedBy: null, ingredients: [], hasComposition: false };
  }

  // Stock por nombre normalizado (se suman las filas que coincidan).
  const stockByName = new Map<string, number>();
  for (const item of items ?? []) {
    const key = categoryKey(item.item);
    if (!key) continue;
    stockByName.set(key, (stockByName.get(key) ?? 0) + resolveStock(item).remaining);
  }

  const ingredients: IngredientCoverage[] = list.map((ingredient) => {
    const key = categoryKey(ingredient.name);
    const inStock = stockByName.has(key);
    const available = stockByName.get(key) ?? 0;
    const basketsFromIt =
      ingredient.quantity > 0 ? Math.floor(available / ingredient.quantity) : 0;
    return {
      name: ingredient.name,
      perBasket: ingredient.quantity,
      unit: ingredient.unit,
      available,
      basketsFromIt,
      inStock,
    };
  });

  const baskets = Math.min(...ingredients.map((i) => i.basketsFromIt));
  const limiting = ingredients.find((i) => i.basketsFromIt === baskets) ?? null;

  return {
    baskets: Number.isFinite(baskets) ? baskets : 0,
    limitedBy: limiting ? limiting.name : null,
    ingredients,
    hasComposition: true,
  };
}

/**
 * Ítems de una donación en especie (V20 · Fase 2/9). Funciones PURAS y testeables.
 *
 * Una donación de productos puede traer VARIOS productos con su cantidad y unidad.
 * Este módulo define el catálogo y las unidades permitidas (allowlist), y normaliza
 * y valida lo que llega del formulario público.
 *
 * REGLA CLAVE: el `estimatedValue` de un producto es ORIENTATIVO y se guarda
 * SEPARADO de los ingresos monetarios. Nunca se suma al dinero recaudado: ese
 * total sale únicamente de `donations.amount` con estado contable confirmado
 * (`approved|reconciled`).
 */

export const DONATION_UNITS = [
  "caja",
  "paquete",
  "saco",
  "unidad",
  "kilogramo",
  "litro",
] as const;
export type DonationUnit = (typeof DONATION_UNITS)[number];

export function isDonationUnit(value: unknown): value is DonationUnit {
  return typeof value === "string" && (DONATION_UNITS as readonly string[]).includes(value);
}

export const DONATION_UNIT_LABEL: Record<DonationUnit, string> = {
  caja: "Caja",
  paquete: "Paquete",
  saco: "Saco",
  unidad: "Unidad",
  kilogramo: "Kilogramo",
  litro: "Litro",
};

/** Catálogo de productos típicos de ChocoFest. `otros` abre el texto libre. */
export const PRODUCT_CATALOG = [
  { value: "panetones", label: "Panetones" },
  { value: "leche", label: "Leche" },
  { value: "chocolate", label: "Chocolate" },
  { value: "arroz", label: "Arroz" },
  { value: "azucar", label: "Azúcar" },
  { value: "aceite", label: "Aceite" },
  { value: "juguetes", label: "Juguetes" },
  { value: "ropa", label: "Ropa" },
  { value: "otros", label: "Otros" },
] as const;

export const OTHER_PRODUCT = "otros" as const;

const CATALOG_VALUES: readonly string[] = PRODUCT_CATALOG.map((p) => p.value);

export function isCatalogProduct(value: unknown): boolean {
  return typeof value === "string" && CATALOG_VALUES.includes(value);
}

/** Etiqueta legible de un producto: catálogo o el texto libre declarado. */
export function productLabel(product: string): string {
  const found = PRODUCT_CATALOG.find((p) => p.value === product);
  return found ? found.label : product;
}

// ─── Límites (evitan payloads abusivos) ──────────────────────────────────────
export const MAX_ITEMS = 10;
export const MAX_QUANTITY = 100000;
export const MAX_ESTIMATED_VALUE = 100000;
export const MAX_ITEM_DESCRIPTION = 300;
export const MAX_OTHER_PRODUCT = 60;

export interface DonationItemInput {
  product?: unknown;
  /** Texto libre cuando `product === "otros"`. */
  productOther?: unknown;
  quantity?: unknown;
  unit?: unknown;
  description?: unknown;
  estimatedValue?: unknown;
}

export interface NormalizedDonationItem {
  product: string;
  quantity: number;
  unit: DonationUnit;
  description: string | null;
  estimatedValue: number;
}

export type NormalizeItemsResult =
  | { ok: true; items: NormalizedDonationItem[] }
  | { ok: false; message: string };

function asNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Máximo de 3 decimales (las cantidades admiten gramos: 1.5 kg). */
function hasAtMost3Decimals(value: number): boolean {
  return Math.abs(value * 1000 - Math.round(value * 1000)) < 1e-6;
}

/** Máximo de 2 decimales (valores monetarios). */
function hasAtMost2Decimals(value: number): boolean {
  return Math.abs(value * 100 - Math.round(value * 100)) < 1e-8;
}

/**
 * Normaliza y valida la lista de productos de una donación.
 *
 * Cantidades mayores que cero, unidad de la allowlist, producto del catálogo (o
 * texto libre si es «otros») y descripción con tope. Cualquier fallo devuelve un
 * mensaje COMPRENSIBLE para el donante (nunca detalles internos).
 */
export function normalizeDonationItems(input: unknown): NormalizeItemsResult {
  if (!Array.isArray(input)) {
    return { ok: false, message: "Añade al menos un producto a tu donación." };
  }
  if (input.length === 0) {
    return { ok: false, message: "Añade al menos un producto a tu donación." };
  }
  if (input.length > MAX_ITEMS) {
    return { ok: false, message: `Puedes registrar como máximo ${MAX_ITEMS} productos por donación.` };
  }

  const items: NormalizedDonationItem[] = [];

  for (let index = 0; index < input.length; index += 1) {
    const raw = (input[index] ?? {}) as DonationItemInput;
    const position = index + 1;

    // Producto: catálogo o texto libre cuando es «otros».
    let product = typeof raw.product === "string" ? raw.product.trim() : "";
    if (product === OTHER_PRODUCT) {
      const other = typeof raw.productOther === "string" ? raw.productOther.trim() : "";
      if (other.length < 2 || other.length > MAX_OTHER_PRODUCT) {
        return {
          ok: false,
          message: `Producto ${position}: describe qué producto donas (entre 2 y ${MAX_OTHER_PRODUCT} caracteres).`,
        };
      }
      product = other;
    } else if (!isCatalogProduct(product)) {
      return { ok: false, message: `Producto ${position}: elige un producto de la lista.` };
    }

    // Cantidad: mayor que cero y con tope.
    const quantity = asNumber(raw.quantity);
    if (quantity === null || quantity <= 0) {
      return { ok: false, message: `Producto ${position}: la cantidad debe ser mayor que cero.` };
    }
    if (quantity > MAX_QUANTITY) {
      return { ok: false, message: `Producto ${position}: la cantidad máxima es ${MAX_QUANTITY}.` };
    }
    if (!hasAtMost3Decimals(quantity)) {
      return { ok: false, message: `Producto ${position}: la cantidad admite máximo 3 decimales.` };
    }

    // Unidad: allowlist.
    if (!isDonationUnit(raw.unit)) {
      return {
        ok: false,
        message: `Producto ${position}: elige una unidad válida (${DONATION_UNITS.join(", ")}).`,
      };
    }

    // Descripción: opcional, con tope.
    const description =
      typeof raw.description === "string" ? raw.description.trim() : "";
    if (description.length > MAX_ITEM_DESCRIPTION) {
      return {
        ok: false,
        message: `Producto ${position}: la descripción no puede superar ${MAX_ITEM_DESCRIPTION} caracteres.`,
      };
    }

    // Valor estimado: OPCIONAL (0 si no se declara). Nunca es un ingreso.
    const estimatedValue = raw.estimatedValue == null || raw.estimatedValue === ""
      ? 0
      : asNumber(raw.estimatedValue);
    if (estimatedValue === null || estimatedValue < 0) {
      return { ok: false, message: `Producto ${position}: el valor estimado no puede ser negativo.` };
    }
    if (estimatedValue > MAX_ESTIMATED_VALUE) {
      return {
        ok: false,
        message: `Producto ${position}: el valor estimado máximo es S/ ${MAX_ESTIMATED_VALUE}.`,
      };
    }
    if (!hasAtMost2Decimals(estimatedValue)) {
      return { ok: false, message: `Producto ${position}: el valor estimado admite máximo 2 decimales.` };
    }

    items.push({
      product,
      quantity,
      unit: raw.unit,
      description: description || null,
      estimatedValue,
    });
  }

  return { ok: true, items };
}

/**
 * Suma de los valores estimados de los ítems. Es SOLO informativa para el panel:
 * NUNCA se añade al dinero recaudado (eso mezclaría bienes con ingresos).
 */
export function sumEstimatedValue(
  items: readonly { estimatedValue: number | string }[],
): number {
  return items.reduce((total, item) => {
    const n = typeof item.estimatedValue === "number" ? item.estimatedValue : Number(item.estimatedValue);
    return total + (Number.isFinite(n) ? n : 0);
  }, 0);
}

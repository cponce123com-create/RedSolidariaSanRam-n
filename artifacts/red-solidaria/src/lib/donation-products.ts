/**
 * Catálogo de productos y unidades del formulario de donación (V20 · Fase 2).
 *
 * Es un ESPEJO de la allowlist del servidor (`api-server/src/lib/donation-items.ts`):
 * el servidor es quien MANDA —rechaza cualquier producto o unidad que no esté en su
 * lista—, así que si aquí faltara algo, el envío fallaría con un mensaje claro. Se
 * mantiene en el frontend para poder pintar los selectores sin una petición extra.
 */

export const DONATION_UNITS = [
  { value: "caja", label: "Caja" },
  { value: "paquete", label: "Paquete" },
  { value: "saco", label: "Saco" },
  { value: "unidad", label: "Unidad" },
  { value: "kilogramo", label: "Kilogramo" },
  { value: "litro", label: "Litro" },
] as const;

export type DonationUnit = (typeof DONATION_UNITS)[number]["value"];

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

export const OTHER_PRODUCT = "otros";

export const MAX_ITEMS = 10;
export const MAX_ITEM_DESCRIPTION = 300;
export const MAX_OTHER_PRODUCT = 60;

/** Fila del editor de productos del formulario. */
export interface DonationItemDraft {
  product: string;
  /** Texto libre cuando el producto es «otros». */
  productOther: string;
  quantity: string;
  unit: DonationUnit;
  description: string;
  /** Valor estimado OPCIONAL (nunca se suma al dinero recaudado). */
  estimatedValue: string;
}

export function emptyDonationItem(): DonationItemDraft {
  return {
    product: "panetones",
    productOther: "",
    quantity: "1",
    unit: "caja",
    description: "",
    estimatedValue: "",
  };
}

/** Etiqueta legible del producto: catálogo o el texto libre declarado. */
export function productLabel(product: string): string {
  const found = PRODUCT_CATALOG.find((p) => p.value === product);
  return found ? found.label : product;
}

/** Ejemplo del prompt: «Caja de 6 panetones». */
export function itemSummary(item: DonationItemDraft): string {
  const label = item.product === OTHER_PRODUCT ? item.productOther : productLabel(item.product);
  const unit = DONATION_UNITS.find((u) => u.value === item.unit)?.label ?? item.unit;
  return `${item.quantity} ${unit.toLowerCase()} · ${label || "—"}`;
}

/** Convierte las filas del editor al payload que espera la API. */
export function toDonationItemsPayload(items: readonly DonationItemDraft[]) {
  return items.map((item) => {
    const other = item.productOther.trim();
    const description = item.description.trim();
    return {
      product: item.product,
      productOther: item.product === OTHER_PRODUCT && other ? other : undefined,
      quantity: Number(item.quantity),
      unit: item.unit,
      description: description || undefined,
      estimatedValue: item.estimatedValue.trim() === "" ? undefined : Number(item.estimatedValue),
    };
  });
}

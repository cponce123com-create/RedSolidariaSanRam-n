// Ítems de una donación en especie (V20 · Fase 2/9). Contratos puros, sin DB.
import { test } from "node:test";
import assert from "node:assert/strict";

const {
  DONATION_UNITS,
  PRODUCT_CATALOG,
  MAX_ITEMS,
  MAX_QUANTITY,
  normalizeDonationItems,
  isDonationUnit,
  isCatalogProduct,
  productLabel,
  sumEstimatedValue,
} = await import("./dist/lib/donation-items.mjs");

const PANETONES = { product: "panetones", quantity: 1, unit: "caja", description: "Caja de 6 panetones" };

test("items: catálogo y unidades permitidas", () => {
  assert.equal(isCatalogProduct("panetones"), true);
  assert.equal(isCatalogProduct("otros"), true);
  assert.equal(isCatalogProduct("cualquiera"), false);
  assert.deepEqual([...DONATION_UNITS], ["caja", "paquete", "saco", "unidad", "kilogramo", "litro"]);
  assert.equal(isDonationUnit("kilogramo"), true);
  assert.equal(isDonationUnit("tonelada"), false);
  assert.equal(productLabel("azucar"), "Azúcar");
  // Un texto libre (producto «otros») se muestra tal cual.
  assert.equal(productLabel("galletas artesanales"), "galletas artesanales");
  assert.equal(PRODUCT_CATALOG.length, 9);
});

test("items: un producto válido se normaliza (ejemplo panetones)", () => {
  const result = normalizeDonationItems([PANETONES]);
  assert.equal(result.ok, true);
  assert.deepEqual(result.items, [
    { product: "panetones", quantity: 1, unit: "caja", description: "Caja de 6 panetones", estimatedValue: 0 },
  ]);
});

test("items: VARIOS productos en una misma donación", () => {
  const result = normalizeDonationItems([
    PANETONES,
    { product: "arroz", quantity: 5, unit: "kilogramo" },
    { product: "leche", quantity: 2, unit: "paquete", estimatedValue: 24.5 },
  ]);
  assert.equal(result.ok, true);
  assert.equal(result.items.length, 3);
  assert.equal(result.items[1].product, "arroz");
  assert.equal(result.items[1].description, null);
  assert.equal(result.items[2].estimatedValue, 24.5);
});

test("items: «otros» exige describir el producto", () => {
  const missing = normalizeDonationItems([{ product: "otros", quantity: 1, unit: "unidad" }]);
  assert.equal(missing.ok, false);
  assert.match(missing.message, /describe qué producto/i);

  const ok = normalizeDonationItems([
    { product: "otros", productOther: "Galletas artesanales", quantity: 3, unit: "paquete" },
  ]);
  assert.equal(ok.ok, true);
  assert.equal(ok.items[0].product, "Galletas artesanales");
});

test("items: producto fuera del catálogo → rechazado", () => {
  const result = normalizeDonationItems([{ product: "caviar", quantity: 1, unit: "unidad" }]);
  assert.equal(result.ok, false);
  assert.match(result.message, /elige un producto de la lista/i);
});

test("items: la cantidad debe ser mayor que cero y con topes", () => {
  for (const quantity of [0, -1, "", null, "abc", undefined]) {
    const result = normalizeDonationItems([{ ...PANETONES, quantity }]);
    assert.equal(result.ok, false, `cantidad ${String(quantity)} debería rechazarse`);
    assert.match(result.message, /cantidad debe ser mayor que cero/i);
  }
  const tooBig = normalizeDonationItems([{ ...PANETONES, quantity: MAX_QUANTITY + 1 }]);
  assert.equal(tooBig.ok, false);
  assert.match(tooBig.message, /cantidad máxima/i);
  const decimals = normalizeDonationItems([{ ...PANETONES, quantity: 1.2345 }]);
  assert.equal(decimals.ok, false);
  assert.match(decimals.message, /3 decimales/i);
  // 1.5 kg es válido (los gramos importan).
  assert.equal(normalizeDonationItems([{ ...PANETONES, quantity: 1.5, unit: "kilogramo" }]).ok, true);
});

test("items: unidad fuera de la allowlist → rechazado", () => {
  const result = normalizeDonationItems([{ ...PANETONES, unit: "camión" }]);
  assert.equal(result.ok, false);
  assert.match(result.message, /unidad válida/i);
});

test("items: descripción con tope y valor estimado opcional", () => {
  const long = normalizeDonationItems([{ ...PANETONES, description: "x".repeat(301) }]);
  assert.equal(long.ok, false);
  assert.match(long.message, /descripción no puede superar/i);

  const negative = normalizeDonationItems([{ ...PANETONES, estimatedValue: -10 }]);
  assert.equal(negative.ok, false);
  assert.match(negative.message, /valor estimado no puede ser negativo/i);

  const decimals = normalizeDonationItems([{ ...PANETONES, estimatedValue: 10.123 }]);
  assert.equal(decimals.ok, false);
  assert.match(decimals.message, /valor estimado admite máximo 2 decimales/i);
});

test("items: lista vacía, no-lista y exceso de productos", () => {
  assert.equal(normalizeDonationItems([]).ok, false);
  assert.equal(normalizeDonationItems(null).ok, false);
  assert.equal(normalizeDonationItems("panetones").ok, false);
  const many = Array.from({ length: MAX_ITEMS + 1 }, () => PANETONES);
  const result = normalizeDonationItems(many);
  assert.equal(result.ok, false);
  assert.match(result.message, /como máximo 10 productos/i);
});

test("items: el valor estimado NUNCA se mezcla con el dinero recaudado", () => {
  const result = normalizeDonationItems([PANETONES, { product: "arroz", quantity: 2, unit: "saco", estimatedValue: 50 }]);
  assert.equal(result.ok, true);
  // Los ítems exponen `estimatedValue` y NO un campo monetario `amount`.
  for (const item of result.items) {
    assert.equal("amount" in item, false);
    assert.equal("estimatedValue" in item, true);
  }
  // La suma de estimados es un agregado APARTE (solo informativo para el panel).
  assert.equal(sumEstimatedValue(result.items), 50);
  assert.equal(sumEstimatedValue([]), 0);
  assert.equal(sumEstimatedValue([{ estimatedValue: "12.50" }, { estimatedValue: 0 }]), 12.5);
});

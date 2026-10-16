// Catálogo de productos, resumen de ítem y teléfono peruano (frontend, V20).
// El servidor es la allowlist que MANDA; aquí se comprueba que el espejo del
// frontend coincide con ella y que el resumen del ejemplo del prompt es correcto.
import { test } from "node:test";
import assert from "node:assert/strict";

const {
  PRODUCT_CATALOG,
  DONATION_UNITS,
  OTHER_PRODUCT,
  emptyDonationItem,
  productLabel,
  itemSummary,
  toDonationItemsPayload,
  MAX_ITEMS,
} = await import("./dist/donation-products.mjs");

const { normalizePePhone, isValidPePhone, whatsappLink } = await import("./dist/phone.mjs");

test("catálogo: coincide con la allowlist del servidor", () => {
  assert.deepEqual(
    PRODUCT_CATALOG.map((p) => p.value),
    ["panetones", "leche", "chocolate", "arroz", "azucar", "aceite", "juguetes", "ropa", "otros"],
  );
  assert.deepEqual(
    DONATION_UNITS.map((u) => u.value),
    ["caja", "paquete", "saco", "unidad", "kilogramo", "litro"],
  );
  assert.equal(OTHER_PRODUCT, "otros");
  assert.equal(MAX_ITEMS, 10);
  assert.equal(productLabel("azucar"), "Azúcar");
});

test("resumen del ítem: el ejemplo del prompt", () => {
  const item = { ...emptyDonationItem(), product: "panetones", quantity: "1", unit: "caja" };
  assert.equal(itemSummary(item), "1 caja · Panetones");
  // Con producto libre («otros») se usa el texto declarado.
  const other = { ...emptyDonationItem(), product: OTHER_PRODUCT, productOther: "Galletas", quantity: "3" };
  assert.equal(itemSummary(other), "3 caja · Galletas");
  // Sin texto libre, el resumen no inventa un producto.
  const blank = { ...emptyDonationItem(), product: OTHER_PRODUCT, productOther: "" };
  assert.equal(itemSummary(blank), "1 caja · —");
});

test("payload: se convierte a números y se omite lo vacío", () => {
  const payload = toDonationItemsPayload([
    { ...emptyDonationItem(), product: "arroz", quantity: "5", unit: "kilogramo", description: "  ", estimatedValue: "" },
    { ...emptyDonationItem(), product: OTHER_PRODUCT, productOther: "Galletas", estimatedValue: "12.50" },
  ]);
  assert.equal(payload[0].quantity, 5);
  assert.equal(payload[0].description, undefined);
  assert.equal(payload[0].estimatedValue, undefined);
  assert.equal(payload[0].productOther, undefined);
  assert.equal(payload[1].productOther, "Galletas");
  assert.equal(payload[1].estimatedValue, 12.5);
});

test("teléfono (frontend): mismo criterio que el servidor", () => {
  assert.equal(normalizePePhone("+51 921 615 737"), "+51921615737");
  assert.equal(normalizePePhone("921615737"), "+51921615737");
  assert.equal(isValidPePhone("821615737"), false);
  assert.equal(isValidPePhone("921615737"), true);
  assert.equal(whatsappLink("921615737"), "https://wa.me/51921615737");
  assert.equal(whatsappLink("921615737", "Hola"), "https://wa.me/51921615737?text=Hola");
  assert.equal(whatsappLink("123"), null);
});

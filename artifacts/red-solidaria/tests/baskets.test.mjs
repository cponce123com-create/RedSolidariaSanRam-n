// Composición y cobertura de canastas (funciones puras, sin red).
import { test } from "node:test";
import assert from "node:assert/strict";

// El salto de línea se construye en tiempo de ejecución (ver chocofest-program).
const NL = String.fromCharCode(10);
const lines = (...items) => items.join(NL);

const { parseComposition, serializeComposition, basketCoverage } = await import(
  "./dist/baskets.mjs"
);

test("parseComposition: producto, cantidad y unidad", () => {
  const composition = parseComposition(
    lines("Arroz | 2 kg", "Aceite | 1", "Frijol | 2,5 kg"),
  );
  assert.deepEqual(composition, [
    { name: "Arroz", quantity: 2, unit: "kg" },
    { name: "Aceite", quantity: 1, unit: "" },
    { name: "Frijol", quantity: 2.5, unit: "kg" },
  ]);
});

test("parseComposition: tolera líneas incompletas y basura", () => {
  const composition = parseComposition(
    lines(
      "Arroz | 2 kg",
      "", // vacía
      "   ", // espacios
      "# nota interna", // comentario
      "Solo el nombre", // sin cantidad → se descarta
      "| 3 kg", // sin nombre → se descarta
      "Azúcar | 0", // cantidad 0 → se descarta
      "Sal | abc", // cantidad inválida → se descarta
    ),
  );
  assert.deepEqual(composition, [{ name: "Arroz", quantity: 2, unit: "kg" }]);
});

test("parseComposition: nunca lanza y normaliza espacios", () => {
  assert.deepEqual(parseComposition(undefined), []);
  assert.deepEqual(parseComposition(null), []);
  assert.deepEqual(parseComposition(""), []);
  assert.deepEqual(parseComposition(42), []);

  const [first] = parseComposition("  Arroz   integral  |   2   kg  ");
  assert.deepEqual(first, { name: "Arroz integral", quantity: 2, unit: "kg" });
});

test("parseComposition: limita el número de insumos", () => {
  const many = Array.from({ length: 50 }, (_, i) => `Producto ${i} | 1`);
  assert.equal(parseComposition(lines(...many)).length, 30);
});

test("serializeComposition: ida y vuelta estable", () => {
  const composition = [
    { name: "Arroz", quantity: 2, unit: "kg" },
    { name: "Aceite", quantity: 1, unit: "" },
  ];
  const text = serializeComposition(composition);
  assert.equal(text, lines("Arroz | 2 kg", "Aceite | 1"));
  assert.deepEqual(parseComposition(text), composition);
  assert.equal(serializeComposition(undefined), "");
  assert.equal(serializeComposition([]), "");
});

const composition = [
  { name: "Arroz", quantity: 2, unit: "kg" },
  { name: "Aceite", quantity: 1, unit: "l" },
];

test("basketCoverage: cuántas canastas completas se pueden armar", () => {
  const coverage = basketCoverage(composition, [
    { id: 1, item: "arroz", quantity: 7, unit: "kg" },
    { id: 2, item: "Aceite", quantity: 5, unit: "l" },
  ]);
  // arroz: 7/2 = 3 canastas · aceite: 5/1 = 5 → manda el arroz.
  assert.equal(coverage.baskets, 3);
  assert.equal(coverage.limitedBy, "Arroz");
  assert.equal(coverage.hasComposition, true);
  assert.deepEqual(
    coverage.ingredients.map((i) => [i.name, i.available, i.basketsFromIt, i.inStock]),
    [
      ["Arroz", 7, 3, true],
      ["Aceite", 5, 5, true],
    ],
  );
});

test("basketCoverage: si falta un insumo no se prometen canastas", () => {
  const coverage = basketCoverage(composition, [
    { id: 1, item: "Arroz", quantity: 100, unit: "kg" },
  ]);
  assert.equal(coverage.baskets, 0);
  assert.equal(coverage.limitedBy, "Aceite");
  const aceite = coverage.ingredients.find((i) => i.name === "Aceite");
  assert.equal(aceite.inStock, false);
  assert.equal(aceite.available, 0);
});

test("basketCoverage: usa el SALDO real (recibido − usado), no la columna cruda", () => {
  const coverage = basketCoverage(
    [{ name: "Arroz", quantity: 2, unit: "kg" }],
    [
      {
        id: 1,
        item: "Arroz",
        quantity: 999, // obsoleto a propósito
        receivedQty: 10,
        usedQty: 6,
      },
    ],
  );
  // Saldo real = 4 kg → 2 canastas (999 se ignora).
  assert.equal(coverage.ingredients[0].available, 4);
  assert.equal(coverage.baskets, 2);
});

test("basketCoverage: sin composición no hay cobertura", () => {
  const vacio = basketCoverage(undefined, [{ id: 1, item: "Arroz", quantity: 10 }]);
  assert.deepEqual(vacio, {
    baskets: 0,
    limitedBy: null,
    ingredients: [],
    hasComposition: false,
  });
  assert.equal(basketCoverage([], null).hasComposition, false);
});

test("basketCoverage: compara insumos sin distinguir mayúsculas ni acentos", () => {
  const coverage = basketCoverage(
    [{ name: "Azúcar", quantity: 1, unit: "kg" }],
    [{ id: 1, item: "AZUCAR", quantity: 4, unit: "kg" }],
  );
  assert.equal(coverage.baskets, 4);
  assert.equal(coverage.limitedBy, "Azúcar");
});

// Inventario y bienes de campaña (funciones puras, sin red).
import { test } from "node:test";
import assert from "node:assert/strict";

const { formatQuantity, formatItemAmount, summarizeInventory } = await import(
  "./dist/inventory.mjs"
);

test("formatQuantity: enteros sin decimales y decimales recortados", () => {
  assert.equal(formatQuantity(3), "3");
  assert.equal(formatQuantity(2.5), "2.5");
  assert.equal(formatQuantity(1.239), "1.24");
  assert.equal(formatQuantity(Number.NaN), "0");
  assert.equal(formatQuantity(Number.POSITIVE_INFINITY), "0");
});

test("formatItemAmount: añade la unidad solo si existe", () => {
  assert.equal(formatItemAmount({ quantity: 3, unit: "cajas" }), "3 cajas");
  assert.equal(formatItemAmount({ quantity: 2, unit: null }), "2");
  assert.equal(formatItemAmount({ quantity: 2, unit: "   " }), "2");
  assert.equal(formatItemAmount({ quantity: 1, unit: "raciones" }), "1 raciones");
});

test("summarizeInventory: cuenta líneas y suma cantidades", () => {
  const s = summarizeInventory([
    { id: 1, item: "Juguetes", quantity: 120 },
    { id: 2, item: "Canastas de víveres", quantity: 40, unit: "canastas" },
    { id: 3, item: "Raciones de chocolatada", quantity: 200.5, unit: "raciones" },
  ]);
  assert.equal(s.lines, 3);
  assert.equal(s.totalQuantity, 360.5);
});

test("summarizeInventory: tolera listas ausentes o vacías", () => {
  assert.deepEqual(summarizeInventory(undefined), { lines: 0, totalQuantity: 0 });
  assert.deepEqual(summarizeInventory(null), { lines: 0, totalQuantity: 0 });
  assert.deepEqual(summarizeInventory([]), { lines: 0, totalQuantity: 0 });
});

test("summarizeInventory: ignora cantidades no numéricas", () => {
  const s = summarizeInventory([
    { id: 1, item: "A", quantity: 2 },
    { id: 2, item: "B", quantity: Number.NaN },
  ]);
  assert.equal(s.lines, 2);
  assert.equal(s.totalQuantity, 2);
});

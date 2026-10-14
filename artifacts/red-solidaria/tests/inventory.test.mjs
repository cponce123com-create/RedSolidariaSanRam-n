// Inventario y bienes de campaña (funciones puras, sin red).
import { test } from "node:test";
import assert from "node:assert/strict";

const {
  INVENTORY_CATEGORIES,
  INVENTORY_CATEGORY_LABEL,
  formatQuantity,
  formatItemAmount,
  goalProgress,
  groupInventoryByCategory,
  normalizeCategory,
  resolveStock,
  summarizeInventory,
} = await import("./dist/inventory.mjs");

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

test("resolveStock: sin flujo registrado manda el saldo (filas antiguas)", () => {
  assert.deepEqual(resolveStock({ id: 1, item: "Juguetes", quantity: 120 }), {
    received: 120,
    used: 0,
    remaining: 120,
    hasFlow: false,
  });
  // Cantidad negativa o no numérica no puede producir un saldo negativo.
  assert.equal(resolveStock({ id: 1, item: "X", quantity: -5 }).remaining, 0);
  assert.equal(resolveStock({ id: 1, item: "X", quantity: Number.NaN }).remaining, 0);
});

test("resolveStock: con flujo, saldo = recibido - usado", () => {
  assert.deepEqual(
    resolveStock({ id: 1, item: "Raciones", quantity: 0, receivedQty: 200, usedQty: 80 }),
    { received: 200, used: 80, remaining: 120, hasFlow: true },
  );
  // Usado ausente equivale a 0.
  assert.equal(
    resolveStock({ id: 1, item: "Raciones", quantity: 0, receivedQty: 50 }).remaining,
    50,
  );
  // Nunca negativo aunque los datos vengan mal.
  assert.equal(
    resolveStock({ id: 1, item: "Raciones", quantity: 0, receivedQty: 10, usedQty: 30 })
      .remaining,
    0,
  );
});

test("goalProgress: sin meta definida no inventa porcentaje", () => {
  const sinMeta = goalProgress(null, 40);
  assert.equal(sinMeta.hasTarget, false);
  assert.equal(sinMeta.percent, 0);
  assert.equal(sinMeta.missing, 0);
  assert.equal(sinMeta.reached, false);
  assert.equal(goalProgress(0, 40).hasTarget, false);
  assert.equal(goalProgress(undefined, 40).hasTarget, false);
});

test("goalProgress: avance, faltante y meta alcanzada", () => {
  const mitad = goalProgress(80, 40);
  assert.equal(mitad.percent, 50);
  assert.equal(mitad.missing, 40);
  assert.equal(mitad.reached, false);

  const completa = goalProgress(80, 80);
  assert.equal(completa.percent, 100);
  assert.equal(completa.reached, true);
  assert.equal(completa.missing, 0);

  // Superar la meta no produce porcentajes > 100 ni faltantes negativos.
  const superada = goalProgress(80, 120);
  assert.equal(superada.percent, 100);
  assert.equal(superada.missing, 0);
  assert.equal(superada.reached, true);
});

test("summarizeInventory: cuenta líneas, saldo y metadatos", () => {
  const s = summarizeInventory([
    { id: 1, item: "Juguetes", quantity: 120, targetQty: 100, category: "regalos" },
    { id: 2, item: "Canastas de víveres", quantity: 40, unit: "canastas" },
    {
      id: 3,
      item: "Raciones de chocolatada",
      // `quantity` obsoleto a propósito: con flujo registrado manda el saldo.
      quantity: 999,
      unit: "raciones",
      receivedQty: 200,
      usedQty: 80,
      category: "chocolatada",
    },
  ]);
  assert.equal(s.lines, 3);
  // El total usa el SALDO: 120 + 40 + (200-80) = 280.
  assert.equal(s.totalQuantity, 280);
  assert.equal(s.withTarget, 1);
  assert.equal(s.withFlow, 1);
});

test("summarizeInventory: tolera listas ausentes o vacías", () => {
  const vacio = { lines: 0, totalQuantity: 0, withTarget: 0, withFlow: 0 };
  assert.deepEqual(summarizeInventory(undefined), vacio);
  assert.deepEqual(summarizeInventory(null), vacio);
  assert.deepEqual(summarizeInventory([]), vacio);
});

test("summarizeInventory: ignora cantidades no numéricas", () => {
  const s = summarizeInventory([
    { id: 1, item: "A", quantity: 2 },
    { id: 2, item: "B", quantity: Number.NaN },
  ]);
  assert.equal(s.lines, 2);
  assert.equal(s.totalQuantity, 2);
});

test("normalizeCategory: desconocidas caen en 'general'", () => {
  assert.equal(normalizeCategory("regalos"), "regalos");
  assert.equal(normalizeCategory("chocolatada"), "chocolatada");
  assert.equal(normalizeCategory("canastas"), "canastas");
  assert.equal(normalizeCategory("otra-cosa"), "general");
  assert.equal(normalizeCategory(null), "general");
  assert.equal(normalizeCategory(7), "general");
});

test("groupInventoryByCategory: agrupa en orden y omite grupos vacíos", () => {
  const groups = groupInventoryByCategory([
    { id: 1, item: "Juguetes", quantity: 10, category: "regalos" },
    { id: 2, item: "Raciones", quantity: 5, category: "chocolatada" },
    { id: 3, item: "Panetones", quantity: 3 },
  ]);
  assert.deepEqual(
    groups.map((g) => g.category),
    ["chocolatada", "regalos", "general"],
  );
  assert.equal(groups[0].label, INVENTORY_CATEGORY_LABEL.chocolatada);
  assert.equal(groups[2].items.length, 1);
  assert.equal(groups[0].summary.lines, 1);
});

test("catálogo de categorías: orden estable y etiquetas completas", () => {
  assert.deepEqual([...INVENTORY_CATEGORIES], [
    "chocolatada",
    "regalos",
    "canastas",
    "general",
  ]);
  for (const category of INVENTORY_CATEGORIES) {
    assert.equal(typeof INVENTORY_CATEGORY_LABEL[category], "string");
    assert.ok(INVENTORY_CATEGORY_LABEL[category].length > 0);
  }
});

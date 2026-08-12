// toSafeAmount: el monto NUNCA debe convertirse a 0 por llegar como string
// (pg devuelve numeric como string y el mapper del customType money depende
// de la forma de la query/versión de drizzle). Un valor realmente corrupto
// cae a 0 en vez de romper el frontend.
import { test } from "node:test";
import assert from "node:assert/strict";

const { toSafeAmount } = await import("./dist/lib/amount-format.mjs");

test("toSafeAmount: number pasa igual", () => {
  assert.equal(toSafeAmount(50), 50);
  assert.equal(toSafeAmount(50.5), 50.5);
  assert.equal(toSafeAmount(0), 0);
  assert.equal(toSafeAmount(120), 120);
});

test("toSafeAmount: string numérico de pg (numeric) se normaliza, NUNCA 0", () => {
  assert.equal(toSafeAmount("50.00"), 50);
  assert.equal(toSafeAmount("790.00"), 790);
  assert.equal(toSafeAmount("120"), 120);
  assert.equal(toSafeAmount("0.00"), 0);
  assert.equal(toSafeAmount(""), 0);
});

test("toSafeAmount: null/undefined/NaN/corrupto → 0 (no rompe el frontend)", () => {
  assert.equal(toSafeAmount(null), 0);
  assert.equal(toSafeAmount(undefined), 0);
  assert.equal(toSafeAmount(NaN), 0);
  assert.equal(toSafeAmount("abc"), 0);
  assert.equal(toSafeAmount(Infinity), 0);
  assert.equal(toSafeAmount(-Infinity), 0);
});

// Regresión "montos en ceros": la columna money leída con proyección por tabla
// puede llegar como string ("3250.00") o null según la versión de drizzle.
// formatCampaign hace Math.max(toSafeAmount(raised), raisedFromDonations):
// el resultado debe ser un number real (la donación aprobada suma), nunca NaN.
test("regresión: Math.max(toSafeAmount(raised), donaciones) nunca devuelve NaN/0 falso", () => {
  // Columna raised como string (mapper no aplicado) + donaciones aprobadas
  assert.equal(Math.max(toSafeAmount("3250.00"), 195), 3250);
  // raised null/corrupto → cae a 0 y gana la suma real de donaciones
  assert.equal(Math.max(toSafeAmount(null), 195), 195);
  assert.equal(Math.max(toSafeAmount(undefined), 195), 195);
  assert.equal(Math.max(toSafeAmount("abc"), 195), 195);
  // Ambos ceros (sin donaciones ni raised) → 0 estable, no NaN
  assert.equal(Math.max(toSafeAmount(null), 0), 0);
  // number puro (mapper aplicado) sigue funcionando
  assert.equal(Math.max(toSafeAmount(3250), 195), 3250);
});

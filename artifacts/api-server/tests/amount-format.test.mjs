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

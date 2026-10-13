// Resolución de la campaña ChocoFest 2026 (función pura, sin red).
import { test } from "node:test";
import assert from "node:assert/strict";

const { findChocofest2026, CHOCOFEST_2026, CHOCOFEST_2026_PATH } = await import(
  "./dist/chocofest.mjs"
);

test("findChocofest2026: coincidencia exacta por título", () => {
  const campaigns = [
    { id: 1, title: "Chocolatada 2024" },
    { id: 2, title: "ChocoFest 2026" },
    { id: 3, title: "Otra" },
  ];
  const found = findChocofest2026(campaigns);
  assert.equal(found?.id, 2);
});

test("findChocofest2026: heurística 'chocofest' + '2026' si no hay coincidencia exacta", () => {
  const campaigns = [{ id: 7, title: "CHOCOFEST 2026 - San Ramón" }];
  assert.equal(findChocofest2026(campaigns)?.id, 7);
});

test("findChocofest2026: no confunde la campaña de 2025", () => {
  const campaigns = [{ id: 9, title: "ChocoFest 2025" }];
  assert.equal(findChocofest2026(campaigns), undefined);
});

test("findChocofest2026: tolera títulos vacíos y listas ausentes", () => {
  assert.equal(findChocofest2026(undefined), undefined);
  assert.equal(findChocofest2026([]), undefined);
  assert.equal(findChocofest2026([{ id: 1, title: null }]), undefined);
  assert.equal(findChocofest2026([{ id: 1, title: "   " }]), undefined);
});

test("config: título, ruta y año consistentes", () => {
  assert.equal(CHOCOFEST_2026.campaignTitle, "ChocoFest 2026");
  assert.equal(CHOCOFEST_2026.year, 2026);
  assert.equal(CHOCOFEST_2026_PATH, "/campanas/chocofest-2026");
});

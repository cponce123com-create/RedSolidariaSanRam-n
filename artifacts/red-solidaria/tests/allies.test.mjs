import { test } from "node:test";
import assert from "node:assert/strict";

// Módulo puro (salvo fetchAllies, que no se ejerce aquí): se puede cargar
// directamente sin React ni red.
const { ALLY_TYPE_COLORS, ALLY_TYPE_LABELS, sortAllies } = await import(
  "./dist/allies.mjs"
);

const ally = (id, featured) => ({
  id,
  name: `Aliado ${id}`,
  type: "empresa",
  logo: null,
  description: null,
  website: null,
  featured,
  active: true,
});

test("sortAllies: los destacados van primero conservando el orden", () => {
  const sorted = sortAllies([ally(1, false), ally(2, true), ally(3, false), ally(4, true)]);
  assert.deepEqual(sorted.map((a) => a.id), [2, 4, 1, 3]);
});

test("sortAllies: no muta el arreglo original", () => {
  const input = [ally(1, false), ally(2, true)];
  const snapshot = input.map((a) => a.id);
  sortAllies(input);
  assert.deepEqual(input.map((a) => a.id), snapshot);
});

test("sortAllies: sin destacados mantiene el orden", () => {
  assert.deepEqual(sortAllies([ally(1, false), ally(2, false)]).map((a) => a.id), [1, 2]);
});

test("ALLY_TYPE_LABELS: cada tipo apunta a una clave i18n de allies", () => {
  for (const key of Object.values(ALLY_TYPE_LABELS)) {
    assert.match(key, /^allies\./);
  }
  assert.equal(Object.keys(ALLY_TYPE_LABELS).length, Object.keys(ALLY_TYPE_COLORS).length);
});

// Selección de gastos para clasificar y eliminar (V12) — lógica PURA.
//
// Regresión que blinda: el checkbox estaba deshabilitado con `!row.deletable`, así
// que los gastos PENDIENTES DE CLASIFICAR (los huérfanos, justo los que hay que
// clasificar) no se podían ni seleccionar. Un catch-22: sin seleccionar no se puede
// clasificar, y sin clasificar no se pueden eliminar.
//
// Regla: SELECCIONAR no autoriza nada (sirve para revisar y clasificar); ELIMINAR
// solo se habilita si TODOS los seleccionados son eliminables.
import { test } from "node:test";
import assert from "node:assert/strict";

const { selectVisible, selectionState, summarizeSelection, toggleSelection } = await import(
  "./dist/expense-selection.mjs"
);

const row = (id, deletable, actionLabel = deletable ? "Eliminación definitiva" : "Revisión manual") => ({
  id,
  deletable,
  actionLabel,
});

const ROWS = [
  row(1, false), // huérfano pendiente de clasificar
  row(2, false), // protegido de ChocoFest
  row(3, true), // eliminable
  row(4, true), // eliminable
];

// ─── Estado del checkbox general ─────────────────────────────────────────────

test("el checkbox general distingue ninguno, parcial y total", () => {
  const visible = [1, 2, 3, 4];
  assert.equal(selectionState([], visible), "none");
  assert.equal(selectionState([1], visible), "some");
  assert.equal(selectionState([1, 3], visible), "some");
  assert.equal(selectionState([1, 2, 3, 4], visible), "all");
  // Lo seleccionado fuera del filtro no cuenta para el estado de los visibles.
  assert.equal(selectionState([9], visible), "none");
  assert.equal(selectionState([9, 1, 2, 3, 4], visible), "all");
  // Sin filas visibles no hay nada que marcar.
  assert.equal(selectionState([1, 2], []), "none");
});

test("el estado se calcula sobre los VISIBLES (los filtros mandan)", () => {
  // Filtrado a los no eliminables: seleccionarlos a todos marca «all» aunque haya
  // eliminables sin seleccionar fuera del filtro.
  assert.equal(selectionState([1, 2], [1, 2]), "all");
  assert.equal(selectionState([1, 2, 3, 4], [1, 2]), "all");
});

// ─── Selección masiva ────────────────────────────────────────────────────────

test("la selección masiva incluye los NO eliminables (es lo que desbloquea)", () => {
  const selected = selectVisible([], [1, 2, 3, 4], true);
  assert.deepEqual(selected, [1, 2, 3, 4]);
  // Los huérfanos y los protegidos entran: sin ellos no se podrían clasificar.
  assert.equal(selected.includes(1), true);
  assert.equal(selected.includes(2), true);
});

test("la selección masiva no duplica y al desmarcar respeta los filtros", () => {
  assert.deepEqual(selectVisible([1], [1, 2], true), [1, 2]);
  assert.deepEqual(selectVisible([1, 2, 9], [1, 2], false), [9]);
  assert.deepEqual(selectVisible([1, 2], [1, 2], false), []);
});

test("marcar y desmarcar un gasto concreto es idempotente por id", () => {
  assert.deepEqual(toggleSelection([], 3), [3]);
  assert.deepEqual(toggleSelection([3], 3), []);
  assert.deepEqual(toggleSelection([1, 3], 2), [1, 3, 2]);
});

// ─── Mezclas de eliminables y no eliminables ─────────────────────────────────

test("con una mezcla, clasificar está disponible y eliminar NO", () => {
  const summary = summarizeSelection(ROWS, [1, 3]);
  assert.equal(summary.total, 2);
  assert.deepEqual(summary.deletableIds, [3]);
  assert.equal(summary.canClassify, true, "se puede clasificar el huérfano");
  assert.equal(summary.canDelete, false, "no se puede eliminar con uno bloqueado");
  assert.equal(summary.allDeletable, false);
});

test("la mezcla indica QUÉ gastos impiden la eliminación", () => {
  const summary = summarizeSelection(ROWS, [1, 2, 3]);
  assert.deepEqual(summary.blocked, [
    { id: 1, actionLabel: "Revisión manual" },
    { id: 2, actionLabel: "Revisión manual" },
  ]);
  assert.deepEqual(summary.deletableIds, [3]);
});

test("solo con eliminables se habilita la eliminación", () => {
  const summary = summarizeSelection(ROWS, [3, 4]);
  assert.equal(summary.canDelete, true);
  assert.equal(summary.allDeletable, true);
  assert.deepEqual(summary.blocked, []);
});

test("solo con no eliminables se puede clasificar pero no eliminar", () => {
  const summary = summarizeSelection(ROWS, [1]);
  assert.equal(summary.canClassify, true);
  assert.equal(summary.canDelete, false);
  assert.equal(summary.total, 1);
});

test("sin selección no hay ninguna acción disponible", () => {
  const summary = summarizeSelection(ROWS, []);
  assert.equal(summary.canClassify, false);
  assert.equal(summary.canDelete, false);
  assert.equal(summary.allDeletable, false);
});

test("tras clasificar como DEMO, el mismo id pasa a permitir la eliminación", () => {
  // Antes: el huérfano #1 está pendiente → bloqueado.
  assert.equal(summarizeSelection(ROWS, [1]).canDelete, false);
  // Después: el servidor devuelve el diagnóstico actualizado (deletable: true) y,
  // con la MISMA selección, la eliminación queda habilitada.
  const afterClassification = ROWS.map((item) =>
    item.id === 1 ? { ...item, deletable: true, actionLabel: "Eliminación definitiva" } : item,
  );
  const summary = summarizeSelection(afterClassification, [1]);
  assert.equal(summary.canDelete, true);
  assert.deepEqual(summary.deletableIds, [1]);
});

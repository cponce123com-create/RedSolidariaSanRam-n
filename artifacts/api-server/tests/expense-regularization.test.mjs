// Regularización de gastos reales (V16): relación gasto↔libro y plan de asientos.
//
// Regresión cubierta: el sistema solo distinguía «tiene / no tiene asiento». Un
// asiento en otra campaña, con importe distinto o duplicado se veía igual que «sin
// asiento», y regularizar a ciegas habría escrito un asiento encima de uno
// existente (duplicando la contabilidad).
import { test } from "node:test";
import assert from "node:assert/strict";

const {
  classifyExpenseLedgerRelation,
  planExpenseRegularization,
  validateExpenseRegularizationRequest,
  movementsOfExpense,
} = await import("./dist/lib/expense-regularization.mjs");

const movement = (over = {}) => ({
  id: 1,
  campaignId: 10,
  kind: "gasto",
  amount: 100,
  sourceType: "expense",
  sourceId: 5,
  ...over,
});

const expense = (over = {}) => ({ id: 5, campaignId: 10, amount: 100, ...over });

test("sin asiento → missing", () => {
  const r = classifyExpenseLedgerRelation(expense(), []);
  assert.equal(r.status, "missing");
  assert.equal(r.movementIds.length, 0);
});

test("asiento correcto → ok", () => {
  const r = classifyExpenseLedgerRelation(expense(), [movement()]);
  assert.equal(r.status, "ok");
  assert.deepEqual(r.movementIds, [1]);
});

test("asiento en OTRA campaña → wrong_campaign (no se regulariza)", () => {
  const r = classifyExpenseLedgerRelation(expense(), [movement({ campaignId: 99 })]);
  assert.equal(r.status, "wrong_campaign");
});

test("asiento con importe distinto → amount_mismatch", () => {
  const r = classifyExpenseLedgerRelation(expense(), [movement({ amount: 99.5 })]);
  assert.equal(r.status, "amount_mismatch");
});

test("dos asientos del mismo gasto → duplicate", () => {
  const r = classifyExpenseLedgerRelation(expense(), [
    movement({ id: 1 }),
    movement({ id: 2 }),
  ]);
  assert.equal(r.status, "duplicate");
  assert.deepEqual(r.movementIds, [1, 2]);
});

test("tipo distinto → wrong_kind", () => {
  const r = classifyExpenseLedgerRelation(expense(), [movement({ kind: "ingreso" })]);
  assert.equal(r.status, "wrong_kind");
});

test("movementsOfExpense ignora asientos de otros orígenes", () => {
  const rows = [
    movement({ id: 1, sourceType: "donation", sourceId: 5 }),
    movement({ id: 2, sourceType: "expense", sourceId: 5 }),
    movement({ id: 3, sourceType: "expense", sourceId: 6 }),
  ];
  assert.deepEqual(movementsOfExpense(5, rows).map((m) => m.id), [2]);
});

test("plan: solo regulariza REALES sin asiento; nunca DEMO", () => {
  const candidates = [
    { id: 5, campaignId: 10, campaignExists: true, amount: 100, description: "Real sin asiento", classification: "real", createdAt: "2025-12-05T12:00:00.000Z" },
    { id: 6, campaignId: 10, campaignExists: true, amount: 50, description: "DEMO", classification: "demo", createdAt: null },
    { id: 7, campaignId: 10, campaignExists: true, amount: 30, description: "Pendiente", classification: "pending", createdAt: null },
    { id: 8, campaignId: 10, campaignExists: true, amount: 20, description: "Real ya contabilizado", classification: "real", createdAt: null },
  ];
  const movements = [movement({ id: 77, sourceId: 8, amount: 20 })];
  const plan = planExpenseRegularization(candidates, movements);

  assert.deepEqual(plan.entries.map((e) => e.expenseId), [5]);
  assert.equal(plan.total, 1);
  assert.equal(plan.amount, 100);
  assert.equal(plan.entries[0].description.includes("gasto #5"), true);
  // Conserva la fecha original del gasto.
  assert.equal(plan.entries[0].createdAt, "2025-12-05T12:00:00.000Z");
  // DEMO/pendiente/ya contabilizado quedan fuera con su motivo.
  assert.equal(plan.skipped.length, 3);
  assert.deepEqual(plan.skipped.map((s) => s.id).sort((a, b) => a - b), [6, 7, 8]);
  assert.equal(plan.skipped.find((s) => s.id === 6).reason.includes("REAL"), true);
  assert.equal(plan.skipped.find((s) => s.id === 8).reason.includes("No se regulariza"), true);
});

test("plan: huérfano real (sin campaña) se salta con motivo", () => {
  const plan = planExpenseRegularization(
    [{ id: 9, campaignId: 10, campaignExists: false, amount: 10, description: "x", classification: "real", createdAt: null }],
    [],
  );
  assert.equal(plan.total, 0);
  assert.equal(plan.skipped[0].reason.includes("campaña ya no existe"), true);
});

test("plan: un asiento mal relacionado NO se regulariza (evita duplicar)", () => {
  const plan = planExpenseRegularization(
    [{ id: 5, campaignId: 10, campaignExists: true, amount: 100, description: "x", classification: "real", createdAt: null }],
    [movement({ campaignId: 99 })],
  );
  assert.equal(plan.total, 0);
  assert.equal(plan.skipped[0].reason.includes("está en la campaña 99"), true);
  assert.equal(plan.relations[5].status, "wrong_campaign");
});

test("plan: idempotente — reintentar con el asiento ya creado no produce entradas", () => {
  const candidates = [
    { id: 5, campaignId: 10, campaignExists: true, amount: 100, description: "x", classification: "real", createdAt: null },
  ];
  const first = planExpenseRegularization(candidates, []);
  assert.equal(first.total, 1);
  // Tras regularizar, el asiento existe: un segundo intento no vuelve a proponerlo.
  const afterMovement = movement({ id: 100, amount: 100 });
  const second = planExpenseRegularization(candidates, [afterMovement]);
  assert.equal(second.total, 0);
  assert.equal(second.amount, 0);
  assert.equal(second.relations[5].status, "ok");
});

test("validación: exige confirm, ids, motivo y evidencia", () => {
  assert.equal(validateExpenseRegularizationRequest({}).ok, false);
  assert.equal(validateExpenseRegularizationRequest({ confirm: true, expenseIds: [1], reason: "corto", evidenceRef: "x" }).ok, false);
  assert.equal(validateExpenseRegularizationRequest({ confirm: true, expenseIds: [1], reason: "motivo suficiente", evidenceRef: "" }).ok, false);
  assert.equal(validateExpenseRegularizationRequest({ confirm: true, expenseIds: [0], reason: "motivo suficiente", evidenceRef: "boleta 1" }).ok, false);
  const ok = validateExpenseRegularizationRequest({ confirm: true, expenseIds: [1, 1, 2], reason: "motivo suficiente", evidenceRef: "boleta 1" });
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.value.expenseIds, [1, 2]);
});

test("totales: regularizar solo añade asientos; gastos, donaciones y saldo no cambian", async () => {
  const { verifyRegularizationTotals } = await import("./dist/lib/expense-regularization.mjs");
  const before = { expensesCount: 15, expensesTotal: 2912.8, donationsTotal: 2818.5, balance: -94.3, movementsCount: 40 };
  const after = { expensesCount: 15, expensesTotal: 2912.8, donationsTotal: 2818.5, balance: -94.3, movementsCount: 55 };

  const ok = verifyRegularizationTotals(before, after, 15);
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.problems, []);
  assert.equal(ok.delta.movementsCount, 15);
  assert.equal(ok.delta.expensesTotal, 0);
  assert.equal(ok.delta.balance, 0);

  // Si el total de gastos cambiara (una escritura de más), se detecta.
  const bad = verifyRegularizationTotals(before, { ...after, expensesTotal: 2913.8 }, 15);
  assert.equal(bad.ok, false);
  assert.equal(bad.problems.length > 0, true);

  // Si se crearan menos asientos de los esperados, también.
  const fewer = verifyRegularizationTotals(before, { ...after, movementsCount: 50 }, 15);
  assert.equal(fewer.ok, false);
});

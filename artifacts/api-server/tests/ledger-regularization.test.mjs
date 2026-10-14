import { test } from "node:test";
import assert from "node:assert/strict";

// Módulo puro: no importa la DB, se puede cargar directamente.
const {
  MIN_REGULARIZATION_REASON,
  planRegularization,
  validateRegularizationRequest,
} = await import("./dist/lib/ledger-regularization.mjs");

test("planRegularization: una donación confirmada sin asiento con campaña propone un ingreso", () => {
  const plan = planRegularization([{ id: 7, campaignId: 3, amount: "150.50" }]);
  assert.equal(plan.total, 1);
  assert.equal(plan.amount, 150.5);
  assert.equal(plan.skipped.length, 0);
  assert.deepEqual(plan.entries[0], {
    kind: "ingreso",
    campaignId: 3,
    amount: 150.5,
    description: "Regularización: asiento faltante de la donación #7",
    sourceType: "donation",
    sourceId: 7,
  });
});

test("planRegularization: la donación sin campaña NO se regulariza y se informa el motivo", () => {
  const plan = planRegularization([{ id: 9, campaignId: null, amount: 40 }]);
  assert.equal(plan.total, 0);
  assert.equal(plan.entries.length, 0);
  assert.equal(plan.skipped.length, 1);
  assert.equal(plan.skipped[0].id, 9);
  assert.match(plan.skipped[0].reason, /campaña/i);
});

test("planRegularization: suma los importes con redondeo a céntimos", () => {
  const plan = planRegularization([
    { id: 1, campaignId: 2, amount: 0.1 },
    { id: 2, campaignId: 2, amount: 0.2 },
  ]);
  assert.equal(plan.total, 2);
  assert.equal(plan.amount, 0.3);
});

test("planRegularization: importe negativo o inválido se acota a cero (nunca resta dinero)", () => {
  const plan = planRegularization([
    { id: 1, campaignId: 2, amount: -5 },
    { id: 2, campaignId: 2, amount: "no-numero" },
  ]);
  assert.equal(plan.amount, 0);
  for (const entry of plan.entries) assert.equal(entry.amount, 0);
});

test("planRegularization: sin donaciones pendientes el plan está vacío", () => {
  const plan = planRegularization([]);
  assert.deepEqual(plan, { entries: [], skipped: [], total: 0, amount: 0 });
});

// ─── Validación de la solicitud ──────────────────────────────────────────────

const validBody = {
  confirm: true,
  donationIds: [1, 2],
  reason: "Asiento faltante detectado en la conciliación de octubre",
  evidenceRef: "voucher-2026-10",
};

test("validateRegularizationRequest: solicitud completa es válida", () => {
  const result = validateRegularizationRequest(validBody);
  assert.equal(result.ok, true);
  assert.deepEqual(result.value.donationIds, [1, 2]);
  assert.equal(result.value.evidenceRef, "voucher-2026-10");
});

test("validateRegularizationRequest: sin confirmación explícita → rechazada", () => {
  const result = validateRegularizationRequest({ ...validBody, confirm: false });
  assert.equal(result.ok, false);
  assert.match(result.message, /confirmación/i);
});

test("validateRegularizationRequest: sin donaciones → rechazada", () => {
  const result = validateRegularizationRequest({ ...validBody, donationIds: [] });
  assert.equal(result.ok, false);
  assert.match(result.message, /donación/i);
});

test("validateRegularizationRequest: identificadores inválidos → rechazada", () => {
  const result = validateRegularizationRequest({
    ...validBody,
    donationIds: [1, "abc"],
  });
  assert.equal(result.ok, false);
});

test("validateRegularizationRequest: deduplica identificadores repetidos", () => {
  const result = validateRegularizationRequest({
    ...validBody,
    donationIds: [4, 4, 5],
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.value.donationIds, [4, 5]);
});

test(`validateRegularizationRequest: motivo de menos de ${MIN_REGULARIZATION_REASON} caracteres → rechazada`, () => {
  const result = validateRegularizationRequest({ ...validBody, reason: "corto" });
  assert.equal(result.ok, false);
  assert.match(result.message, /motivo/i);
});

test("validateRegularizationRequest: sin evidencia documental → rechazada", () => {
  const result = validateRegularizationRequest({ ...validBody, evidenceRef: "  " });
  assert.equal(result.ok, false);
  assert.match(result.message, /evidencia/i);
});

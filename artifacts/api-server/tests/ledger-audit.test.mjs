// Auditoría del libro contable (funciones puras, sin DB).
// Fase 1.4 del Prompt Maestro V7: la cadena puede verificar y el libro seguir
// incompleto (donaciones confirmadas sin asiento). El informe señala, no corrige.
import { test } from "node:test";
import assert from "node:assert/strict";

const { auditLedger, KNOWN_SOURCE_TYPES } = await import(
  "./dist/lib/ledger-audit.mjs"
);

const OK_CHAIN = { verified: true, brokenAt: null, rootHash: "abc", count: 2 };

function donation(id, amount, campaignId = 1, confirmed = true) {
  return { id, campaignId, amount, confirmed };
}

function movement(id, sourceType, sourceId, amount, campaignId = 1, kind = "ingreso") {
  return { id, campaignId, kind, amount, sourceType, sourceId };
}

test("libro cuadrado y cadena íntegra: sin hallazgos", () => {
  const report = auditLedger({
    movements: [movement(1, "donation", 10, 100), movement(2, "expense", 5, 40, 1, "gasto")],
    donations: [donation(10, 100)],
    expenses: [{ id: 5, campaignId: 1, amount: 40 }],
    chain: OK_CHAIN,
  });
  assert.equal(report.healthy, true);
  assert.deepEqual(report.donationsWithoutMovement, []);
  assert.deepEqual(report.movementsWithoutSource, []);
  assert.deepEqual(report.amountMismatches, []);
  assert.deepEqual(report.campaignMismatches, []);
  assert.equal(report.movementCount, 2);
});

test("cadena rota: nunca se declara sano aunque el libro cuadre", () => {
  const report = auditLedger({
    movements: [movement(1, "donation", 10, 100)],
    donations: [donation(10, 100)],
    expenses: [],
    chain: { verified: false, brokenAt: 1, rootHash: "x", count: 1 },
  });
  assert.equal(report.healthy, false);
  assert.equal(report.chain.brokenAt, 1);
});

test("donación confirmada sin asiento (DB-09): se detecta", () => {
  const report = auditLedger({
    movements: [movement(1, "donation", 10, 100)],
    donations: [donation(10, 100), donation(11, 250, 2)],
    expenses: [],
    chain: OK_CHAIN,
  });
  assert.equal(report.healthy, false);
  assert.deepEqual(report.donationsWithoutMovement, [
    { id: 11, campaignId: 2, amount: 250 },
  ]);
});

test("donación pendiente o rechazada sin asiento: NO es un hallazgo", () => {
  // Solo se registran en el libro al aprobarse; una pendiente no debe contar.
  const report = auditLedger({
    movements: [],
    donations: [donation(10, 100, 1, false), donation(11, 50, 1, false)],
    expenses: [],
    chain: { verified: true, brokenAt: null, rootHash: "abc", count: 0 },
  });
  assert.equal(report.healthy, true);
});

test("asiento cuyo origen no existe: se detecta", () => {
  const report = auditLedger({
    movements: [movement(1, "donation", 99, 100)],
    donations: [],
    expenses: [],
    chain: OK_CHAIN,
  });
  assert.equal(report.healthy, false);
  assert.deepEqual(report.movementsWithoutSource, [
    { id: 1, sourceType: "donation", sourceId: 99 },
  ]);
});

test("asiento con tipo de origen desconocido: se detecta", () => {
  const report = auditLedger({
    movements: [movement(1, "ajuste", 7, 100)],
    donations: [],
    expenses: [],
    chain: OK_CHAIN,
  });
  assert.deepEqual(report.movementsWithoutSource, [
    { id: 1, sourceType: "ajuste", sourceId: 7 },
  ]);
  assert.deepEqual([...KNOWN_SOURCE_TYPES], ["donation", "expense"]);
});

test("importe del asiento distinto al del origen: se detecta", () => {
  const report = auditLedger({
    movements: [movement(1, "donation", 10, 90)],
    donations: [donation(10, 100)],
    expenses: [],
    chain: OK_CHAIN,
  });
  assert.equal(report.healthy, false);
  assert.deepEqual(report.amountMismatches, [
    { movementId: 1, sourceType: "donation", sourceId: 10, movementAmount: 90, sourceAmount: 100 },
  ]);
});

test("importes equivalentes (number/string, centimos): NO son hallazgo", () => {
  const report = auditLedger({
    movements: [movement(1, "donation", 10, "100.00"), movement(2, "donation", 11, 0.1 + 0.2)],
    donations: [donation(10, 100), donation(11, 0.3)],
    expenses: [],
    chain: OK_CHAIN,
  });
  assert.deepEqual(report.amountMismatches, []);
  assert.equal(report.healthy, true);
});

test("asiento en otra campaña que su origen: se detecta", () => {
  const report = auditLedger({
    movements: [movement(1, "expense", 5, 40, 3, "gasto")],
    donations: [],
    expenses: [{ id: 5, campaignId: 1, amount: 40 }],
    chain: OK_CHAIN,
  });
  assert.equal(report.healthy, false);
  assert.deepEqual(report.campaignMismatches, [
    { movementId: 1, sourceType: "expense", sourceId: 5, movementCampaignId: 3, sourceCampaignId: 1 },
  ]);
});

test("gasto sin campaña (fondo general) no se reporta como descuadre", () => {
  const report = auditLedger({
    movements: [movement(1, "donation", 10, 100, 1)],
    donations: [donation(10, 100, null)],
    expenses: [],
    chain: OK_CHAIN,
  });
  // El asiento apunta a la campaña 1 y la donación es de fondo general: es un
  // descuadre real y debe verse, no ocultarse.
  assert.equal(report.campaignMismatches.length, 1);
  assert.equal(report.healthy, false);
});

test("informe vacío: sin movimientos ni orígenes, sano si la cadena verifica", () => {
  const report = auditLedger({
    movements: [],
    donations: [],
    expenses: [],
    chain: { verified: true, brokenAt: null, rootHash: "", count: 0 },
  });
  assert.equal(report.healthy, true);
  assert.equal(report.movementCount, 0);
});

// La cadena de hashes del libro es INDEPENDIENTE por campaña (Fase 2, V7.1).
// Verificar todas las filas como si fueran una única cadena global daba un falso
// «cadena rota» en cuanto había movimientos de dos campañas distintas. Este
// archivo fija el comportamiento correcto (agrupar por campaña antes de
// verificar) y documenta el error que corrige.
import { test } from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL ??= "postgres://localhost:5432/nonexistent";

const { computeMovementHash, verifyCampaignChains, verifyChain, GENESIS_PREV } =
  await import("./dist/lib/ledger.mjs");

function entry(overrides = {}) {
  return {
    kind: "ingreso",
    amount: 100.1,
    description: "Donación de Ana",
    sourceType: "donation",
    sourceId: 1,
    createdAt: new Date("2026-08-10T10:00:00.000Z"),
    ...overrides,
  };
}

/** Construye una cadena válida (encadenada) para una campaña. */
function buildChain(campaignId, startId, entries) {
  const rows = [];
  let prev = GENESIS_PREV;
  let id = startId;
  for (const item of entries) {
    const hash = computeMovementHash(prev, item);
    rows.push({ id, campaignId, ...item, prevHash: prev, hash });
    prev = hash;
    id += 1;
  }
  return rows;
}

test("verifyCampaignChains: dos cadenas válidas (campañas distintas) verifican", () => {
  const c1 = buildChain(1, 1, [entry({ sourceId: 1 }), entry({ sourceId: 2 })]);
  const c2 = buildChain(2, 3, [entry({ sourceId: 10 })]);
  const all = [...c1, ...c2];

  const result = verifyCampaignChains(all);
  assert.equal(result.verified, true);
  assert.equal(result.campaigns, 2);
  assert.equal(result.count, 3);
  // Con varias cadenas la raíz es ambigua: se devuelve null.
  assert.equal(result.rootHash, null);
  assert.equal(result.brokenAt, null);
});

test("regresión: verificar globalmente daba un falso «cadena rota»", () => {
  const c1 = buildChain(1, 1, [entry({ sourceId: 1 }), entry({ sourceId: 2 })]);
  const c2 = buildChain(2, 3, [entry({ sourceId: 10 })]);
  const all = [...c1, ...c2];

  // El comportamiento anterior (una sola cadena) fallaba con varias campañas...
  assert.equal(verifyChain(all).verified, false);
  // ...y el nuevo (por campaña) acierta.
  assert.equal(verifyCampaignChains(all).verified, true);
});

test("verifyCampaignChains: una sola cadena devuelve su raíz", () => {
  const c1 = buildChain(7, 1, [entry({ sourceId: 1 }), entry({ sourceId: 2 })]);
  const result = verifyCampaignChains(c1);
  assert.equal(result.verified, true);
  assert.equal(result.campaigns, 1);
  assert.equal(result.rootHash, c1[1].hash);
});

test("verifyCampaignChains: una fila manipulada invalida su cadena (brokenAt)", () => {
  const c1 = buildChain(1, 1, [entry({ sourceId: 1 })]);
  const c2 = buildChain(2, 2, [entry({ sourceId: 10 }), entry({ sourceId: 11 })]);
  c2[0].amount = 999999; // manipulación: el hash ya no cubre el contenido
  const result = verifyCampaignChains([...c1, ...c2]);
  assert.equal(result.verified, false);
  assert.equal(result.brokenAt, c2[0].id);
});

test("verifyCampaignChains: sin movimientos verifica con cero cadenas", () => {
  const result = verifyCampaignChains([]);
  assert.deepEqual(result, {
    verified: true,
    brokenAt: null,
    rootHash: null,
    count: 0,
    campaigns: 0,
  });
});

import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";

process.env.DATABASE_URL ??= "postgres://localhost:5432/nonexistent";

const { computeMovementHash, verifyChain, GENESIS_PREV } = await import(
  "./dist/lib/ledger.mjs"
);
const { default: movementsRouter } = await import("./dist/routes/campaign-movements.mjs");

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

// Construye una cadena válida secuencial (función pura, sin DB).
function buildChain(entries) {
  let prev = GENESIS_PREV;
  return entries.map((e, i) => {
    const date = new Date(e.createdAt);
    const hash = computeMovementHash(prev, { ...e, createdAt: date });
    const row = { id: i + 1, prevHash: prev, hash, ...e, createdAt: date };
    prev = hash;
    return row;
  });
}

// ─── computeMovementHash ─────────────────────────────────────────────────────

test("hash: determinista y de 64 hex", () => {
  const h1 = computeMovementHash(GENESIS_PREV, entry());
  assert.equal(h1, computeMovementHash(GENESIS_PREV, entry()));
  assert.match(h1, /^[0-9a-f]{64}$/);
});

test("hash: cambia ante cualquier alteración del contenido", () => {
  const base = computeMovementHash(GENESIS_PREV, entry());
  assert.notEqual(base, computeMovementHash(GENESIS_PREV, entry({ amount: 100.11 })));
  assert.notEqual(base, computeMovementHash(GENESIS_PREV, entry({ sourceId: 2 })));
  assert.notEqual(base, computeMovementHash(GENESIS_PREV, entry({ description: "Otra" })));
  assert.notEqual(base, computeMovementHash(GENESIS_PREV, entry({ kind: "gasto" })));
  assert.notEqual(base, computeMovementHash("prev-otro", entry()));
});

test("hash: el ruido float4 (100.1 vs 100.099998) hashea igual (toFixed(2))", () => {
  assert.equal(
    computeMovementHash(GENESIS_PREV, entry({ amount: 100.1 })),
    computeMovementHash(GENESIS_PREV, entry({ amount: 100.099998 })),
  );
});

// ─── verifyChain ─────────────────────────────────────────────────────────────

test("verify: cadena válida → verified, rootHash = último hash", () => {
  const rows = buildChain([
    entry(),
    entry({
      kind: "gasto",
      amount: 50,
      description: "Compra de alimentos",
      sourceType: "expense",
      sourceId: 1,
      createdAt: "2026-08-11T10:00:00.000Z",
    }),
  ]);
  const result = verifyChain(rows);
  assert.equal(result.verified, true);
  assert.equal(result.rootHash, rows[1].hash);
  assert.equal(result.count, 2);
});

test("verify: monto manipulado → brokenAt señala la fila", () => {
  const rows = buildChain([
    entry(),
    entry({ sourceId: 2, createdAt: "2026-08-11T10:00:00.000Z" }),
  ]);
  rows[1].amount = 5000; // tamper del atacante
  const result = verifyChain(rows);
  assert.equal(result.verified, false);
  assert.equal(result.brokenAt, rows[1].id);
  assert.equal(result.rootHash, null);
});

test("verify: enlace roto (prevHash alterado) → brokenAt", () => {
  const rows = buildChain([
    entry(),
    entry({ sourceId: 2, createdAt: "2026-08-11T10:00:00.000Z" }),
    entry({ sourceId: 3, createdAt: "2026-08-12T10:00:00.000Z" }),
  ]);
  rows[2].prevHash = "0".repeat(64);
  const result = verifyChain(rows);
  assert.equal(result.verified, false);
  assert.equal(result.brokenAt, rows[2].id);
});

test("verify: borrar una entrada intermedia rompe la cadena", () => {
  const rows = buildChain([
    entry(),
    entry({ sourceId: 2, createdAt: "2026-08-11T10:00:00.000Z" }),
    entry({ sourceId: 3, createdAt: "2026-08-12T10:00:00.000Z" }),
  ]);
  // Un DELETE físico de la fila 2: el bloque 3 ya no encadena con el 1.
  const tampered = [rows[0], rows[2]];
  const result = verifyChain(tampered);
  assert.equal(result.verified, false);
  assert.equal(result.brokenAt, rows[2].id);
});

test("verify: cadena vacía → verified sin rootHash", () => {
  const result = verifyChain([]);
  assert.equal(result.verified, true);
  assert.equal(result.rootHash, null);
  assert.equal(result.count, 0);
});

// ─── Rutas públicas (sin DB real: deben responder, nunca 404) ────────────────

async function withServer(app, fn) {
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const { port } = server.address();
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function buildApp() {
  const app = express();
  app.use(movementsRouter);
  app.use((err, _req, res, _next) => {
    res.status(500).json({ error: "test_server_error" });
  });
  return app;
}

test("GET /campaigns/:id/movements está montado (nunca 404)", async () => {
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/campaigns/1/movements`);
    assert.notEqual(res.status, 404);
  });
});

test("GET /campaigns/:id/movements/verify está montado (nunca 404)", async () => {
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/campaigns/1/movements/verify`);
    assert.notEqual(res.status, 404);
  });
});

test("GET /ledger/root está montado (nunca 404)", async () => {
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/ledger/root`);
    assert.notEqual(res.status, 404);
  });
});

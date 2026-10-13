import { test } from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL ??= "postgres://localhost:5432/nonexistent";

// Se ejecuta contra el bundle de tests (build-tests.mjs), igual que ledger.test.mjs.
const { appendMovement, verifyChain, GENESIS_PREV } = await import(
  "./dist/lib/ledger.mjs"
);

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

// Extrae la dirección (asc/desc) del objeto SQL que recibe `.orderBy(...)`.
// Drizzle construye `sql`${col} desc`` → un StringChunk con el sufijo " desc".
function orderDirection(sqlObject) {
  for (const chunk of sqlObject?.queryChunks ?? []) {
    const raw = Array.isArray(chunk?.value) ? chunk.value.join("") : chunk?.value;
    if (typeof raw !== "string") continue;
    if (/\bdesc\b/i.test(raw)) return "desc";
    if (/\basc\b/i.test(raw)) return "asc";
  }
  return null;
}

// Cliente simulado: emula la DB sin conexión real. Respeta la dirección del
// `orderBy` para devolver el primer o el último hash, reproduciendo el bug.
function createFakeClient(rows, captured) {
  let selectCalls = 0;
  const client = {
    select() {
      const call = selectCalls++;
      const builder = {
        _orderBy: null,
        from() {
          return builder;
        },
        where() {
          return builder;
        },
        orderBy(arg) {
          builder._orderBy = arg;
          return builder;
        },
        limit() {
          return builder;
        },
        for() {
          // 1.ª consulta: lock del registro de campaña.
          if (call === 0) return Promise.resolve([{ id: 1 }]);
          // 2.ª consulta: último hash de la cadena.
          const dir = orderDirection(builder._orderBy);
          captured.direction = dir;
          if (rows.length === 0) return Promise.resolve([]);
          const row = dir === "desc" ? rows[rows.length - 1] : rows[0];
          return Promise.resolve([{ hash: row.hash }]);
        },
      };
      return builder;
    },
    insert() {
      return {
        values(row) {
          rows.push({ id: rows.length + 1, ...row });
          return Promise.resolve();
        },
      };
    },
  };
  return client;
}

test("appendMovement ordena el prev_hash con ORDER BY id DESC (regresión)", async () => {
  const rows = [];
  const captured = {};
  const client = createFakeClient(rows, captured);
  await appendMovement(client, 1, entry());
  assert.equal(
    captured.direction,
    "desc",
    "appendMovement debe leer el ÚLTIMO movimiento (id DESC), no el primero",
  );
});

test("appendMovement encadena 3 movimientos → verifyChain válido", async () => {
  const rows = [];
  const captured = {};
  const client = createFakeClient(rows, captured);

  await appendMovement(
    client,
    1,
    entry({ sourceId: 1, createdAt: new Date("2026-08-10T10:00:00.000Z") }),
  );
  await appendMovement(
    client,
    1,
    entry({ sourceId: 2, createdAt: new Date("2026-08-11T10:00:00.000Z") }),
  );
  await appendMovement(
    client,
    1,
    entry({ sourceId: 3, createdAt: new Date("2026-08-12T10:00:00.000Z") }),
  );

  assert.equal(rows.length, 3);

  const result = verifyChain(rows);
  assert.equal(
    result.verified,
    true,
    `cadena rota en el bloque ${result.brokenAt} (esperado: cadena íntegra)`,
  );
  assert.equal(result.count, 3);
  assert.equal(rows[0].prevHash, GENESIS_PREV);
  assert.equal(rows[1].prevHash, rows[0].hash);
  assert.equal(rows[2].prevHash, rows[1].hash);
  assert.equal(result.rootHash, rows[2].hash);
});

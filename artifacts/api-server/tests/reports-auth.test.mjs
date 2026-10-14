import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";

// reports.ts importa @workspace/db (exige DATABASE_URL al cargar).
process.env.DATABASE_URL ??= "postgres://localhost:5432/nonexistent";

const { default: reportsRouter } = await import("./dist/routes/reports.mjs");

// Los informes contables son PRIVADOS: se verifica la autorización (401/403).
function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.log = { error() {}, warn() {}, info() {}, debug() {} };
    const role = req.headers["x-test-role"];
    if (typeof role === "string" && role) {
      req.session = { adminUser: { id: 1, username: "admin", role } };
    }
    next();
  });
  app.use("/api", reportsRouter);
  app.use((err, _req, res, _next) => {
    res.status(500).json({ error: "test_server_error" });
  });
  return app;
}

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

function get(base, path, role) {
  return fetch(`${base}/api${path}`, {
    headers: role ? { "x-test-role": role } : {},
  });
}

test("informe de donaciones sin sesión → 401", async () => {
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await get(base, "/admin/reports/donations.csv");
    assert.equal(res.status, 401);
  });
});

test("informe de donaciones con rol insuficiente (moderador) → 403", async () => {
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await get(base, "/admin/reports/donations.csv", "moderador");
    assert.equal(res.status, 403);
  });
});

test("libro contable con rol insuficiente (moderador) → 403", async () => {
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await get(base, "/admin/reports/movements.csv", "moderador");
    assert.equal(res.status, 403);
  });
});

test("informe de donaciones (administrador) pasa autorización", async () => {
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await get(base, "/admin/reports/donations.csv?status=approved", "administrador");
    // Sin DB falla en la capa de datos: lo cubierto es auth + ruta.
    assert.notEqual(res.status, 400);
    assert.notEqual(res.status, 401);
    assert.notEqual(res.status, 403);
  });
});

test("libro contable (administrador) pasa autorización", async () => {
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await get(base, "/admin/reports/movements.csv", "administrador");
    assert.notEqual(res.status, 400);
    assert.notEqual(res.status, 401);
    assert.notEqual(res.status, 403);
  });
});

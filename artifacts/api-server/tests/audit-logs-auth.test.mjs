import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";

// audit-logs.ts importa @workspace/db (exige DATABASE_URL al cargar; el pool no
// se conecta hasta la primera query → dummy basta).
process.env.DATABASE_URL ??= "postgres://localhost:5432/nonexistent";

const { default: auditLogsRouter } = await import("./dist/routes/audit-logs.mjs");

// El registro de auditoría es PRIVADO: se verifica autorización (401/403).
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
  app.use("/api", auditLogsRouter);
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

test("GET /admin/audit-logs sin sesión → 401", async () => {
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await get(base, "/admin/audit-logs");
    assert.equal(res.status, 401);
  });
});

test("GET /admin/audit-logs con rol insuficiente (moderador) → 403", async () => {
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await get(base, "/admin/audit-logs", "moderador");
    assert.equal(res.status, 403);
  });
});

test("GET /admin/audit-logs (administrador) pasa autorización y validación", async () => {
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await get(base, "/admin/audit-logs?limit=10", "administrador");
    // Sin DB falla en la capa de datos (500): lo cubierto es auth + ruta.
    assert.notEqual(res.status, 400);
    assert.notEqual(res.status, 401);
    assert.notEqual(res.status, 403);
  });
});

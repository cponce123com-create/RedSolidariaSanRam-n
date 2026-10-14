// Autorización del informe de integridad del libro contable (Fase 1.4 del
// Prompt Maestro V7). El informe expone el estado financiero completo, así que
// debe exigir sesión de administrador igual que el resto de rutas /admin.
import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";

// El bundle importa @workspace/db, que exige DATABASE_URL al cargar el módulo;
// el pool no se conecta hasta la primera query y aquí no se ejecuta ninguna.
process.env.DATABASE_URL ??= "postgres://localhost:5432/nonexistent";

const { default: ledgerAuditRouter } = await import(
  "./dist/routes/ledger-audit.mjs"
);

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    if (req.headers["x-test-admin"] === "1") {
      req.session = { adminUser: { id: 1, username: "admin", role: "superadmin" } };
    }
    next();
  });
  app.use("/api", ledgerAuditRouter);
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

test("GET /api/admin/ledger/audit sin sesión admin → 401", async () => {
  await withServer(buildApp(), async (base) => {
    const res = await fetch(`${base}/api/admin/ledger/audit`);
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.error, "unauthorized");
  });
});

test("GET /api/admin/ledger/audit con sesión admin → no 401 (pasa el middleware)", async () => {
  await withServer(buildApp(), async (base) => {
    const res = await fetch(`${base}/api/admin/ledger/audit`, {
      headers: { "x-test-admin": "1" },
    });
    // Sin DB real el handler falla (500); lo cubierto es autorización + ruta.
    assert.notEqual(res.status, 401);
    assert.notEqual(res.status, 403);
    assert.notEqual(res.status, 404);
  });
});

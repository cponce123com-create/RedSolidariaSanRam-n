import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";

// Presupuesto por categoría (Fase 2.5): el router importa @workspace/db (exige
// DATABASE_URL al cargar; el pool no se conecta hasta la primera query → dummy
// basta).
process.env.DATABASE_URL ??= "postgres://localhost:5432/nonexistent";

const { default: budgetsRouter } = await import("./dist/routes/campaign-budgets.mjs");
const { requireAdmin } = await import("./dist/middleware/require-admin.mjs");
const { adminActionLimiter } = await import("./dist/middleware/rate-limit.mjs");

// App mínima replicando el pipeline real (gate /admin/* + router montado en
// /api). Sin DB real: cualquier ruta que llegue a la query responde 500 vía el
// error handler (nunca 401/403/404), que es lo que estos tests distinguen.
function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    if (req.headers["x-test-admin"] === "1") {
      req.session = { adminUser: { id: 1, username: "admin", role: "superadmin" } };
    }
    next();
  });
  app.use("/api/admin", requireAdmin, adminActionLimiter);
  app.use("/api", budgetsRouter);
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

test("GET /campaigns/:id/budgets público NO exige auth (llega a la query → 500)", async () => {
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/campaigns/1/budgets`);
    assert.notEqual(res.status, 401);
    assert.notEqual(res.status, 403);
    assert.notEqual(res.status, 404);
    assert.equal(res.status, 500);
  });
});

test("GET /admin/campaigns/:id/budgets sin sesión → 401 (gate global /admin)", async () => {
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/admin/campaigns/1/budgets`);
    assert.equal(res.status, 401);
  });
});

test("GET /admin/campaigns/:id/budgets con sesión admin → pasa el gate (llega a DB → 500)", async () => {
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/admin/campaigns/1/budgets`, {
      headers: { "x-test-admin": "1" },
    });
    assert.notEqual(res.status, 401);
    assert.notEqual(res.status, 403);
    assert.equal(res.status, 500);
  });
});

test("POST /campaigns/:id/budgets sin sesión → 401 (requiere admin)", async () => {
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/campaigns/1/budgets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category: "Alimentos", plannedAmount: 1000 }),
    });
    assert.equal(res.status, 401);
  });
});

test("POST con sesión y categoría vacía → 400 con mensaje accionable (no llega a la DB)", async () => {
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/campaigns/1/budgets`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-test-admin": "1" },
      body: JSON.stringify({ category: "   ", plannedAmount: 1000 }),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error, "validation_error");
    assert.match(body.message, /categoría/i);
  });
});

test("POST con sesión y monto inválido → 400 (no llega a la DB)", async () => {
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/campaigns/1/budgets`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-test-admin": "1" },
      body: JSON.stringify({ category: "Alimentos", plannedAmount: -5 }),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.message, /monto/i);
  });
});

test("DELETE /campaigns/:id/budgets/:id sin sesión → 401", async () => {
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/campaigns/1/budgets/1`, { method: "DELETE" });
    assert.equal(res.status, 401);
  });
});

import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";

// Los routers de leftovers/transparency importan @workspace/db (exige
// DATABASE_URL al cargar; el pool no se conecta hasta la primera query → dummy
// basta). transparency importa formatLeftover del router de leftovers, así que
// el bundle cubre ambos.
process.env.DATABASE_URL ??= "postgres://localhost:5432/nonexistent";

const { default: leftoversRouter } = await import("./dist/routes/campaign-leftovers.mjs");
const { default: transparencyRouter } = await import("./dist/routes/campaign-transparency.mjs");
const { requireAdmin } = await import("./dist/middleware/require-admin.mjs");
const { adminActionLimiter } = await import("./dist/middleware/rate-limit.mjs");

// App mínima replicando el pipeline real (gate /admin/* + routers montados en
// /api). Sin DB real: cualquier ruta que llegue a la query responde 500 vía el
// error handler (nunca 401/403/404), que es lo que los tests distinguen.
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
  app.use("/api", transparencyRouter);
  app.use("/api", leftoversRouter);
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

async function get(base, path, admin = false) {
  return fetch(`${base}${path}`, {
    headers: admin ? { "x-test-admin": "1" } : {},
  });
}

// ─── Fuga de datos: GET públicos NUNCA exigen auth (el filtro SQL de
// is_public=true se verifica en integración; aquí se comprueba que no hay
// gate) y las rutas admin SÍ exigen sesión. ───────────────────────────────────

test("GET /campaigns/:id/leftovers público NO exige auth (anónimo llega a la query → 500, no 401/403)", async () => {
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await get(base, "/api/campaigns/1/leftovers");
    assert.notEqual(res.status, 401);
    assert.notEqual(res.status, 403);
    assert.notEqual(res.status, 404);
    assert.equal(res.status, 500); // llegó a la DB (dummy) → error handler
  });
});

test("GET /campaigns/:id/transparency sigue existiendo (incluye sobrantes)", async () => {
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await get(base, "/api/campaigns/1/transparency");
    assert.notEqual(res.status, 404, "el endpoint /transparency debe estar registrado");
    assert.notEqual(res.status, 401);
    assert.notEqual(res.status, 403);
    assert.equal(res.status, 500); // llegó a la DB (dummy)
  });
});

test("GET /admin/campaigns/:id/leftovers sin sesión → 401 (gate global /admin)", async () => {
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await get(base, "/api/admin/campaigns/1/leftovers");
    assert.equal(res.status, 401);
  });
});

test("GET /admin/campaigns/:id/leftovers con sesión admin → pasa el gate (llega a DB → 500, no 401/403)", async () => {
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await get(base, "/api/admin/campaigns/1/leftovers", true);
    assert.notEqual(res.status, 401);
    assert.notEqual(res.status, 403);
    assert.equal(res.status, 500);
  });
});

test("POST /campaigns/:id/leftovers sin sesión → 401 (requiere admin)", async () => {
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/campaigns/1/leftovers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item: "2 cajas de panetón", quantity: 2, unit: "cajas" }),
    });
    assert.equal(res.status, 401);
  });
});

test("POST /campaigns/:id/leftovers con sesión admin → pasa el gate (llega a DB → 500, no 401/403)", async () => {
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/campaigns/1/leftovers`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-test-admin": "1" },
      body: JSON.stringify({ item: "2 cajas de panetón", quantity: 2, unit: "cajas" }),
    });
    assert.notEqual(res.status, 401);
    assert.notEqual(res.status, 403);
    assert.equal(res.status, 500);
  });
});

test("DELETE /campaigns/:id/leftovers/:id sin sesión → 401", async () => {
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/campaigns/1/leftovers/1`, { method: "DELETE" });
    assert.equal(res.status, 401);
  });
});

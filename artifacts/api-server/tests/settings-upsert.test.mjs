import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";

// settings.ts importa @workspace/db (exige DATABASE_URL al cargar; el pool no
// se conecta hasta la primera query → dummy basta).
process.env.DATABASE_URL ??= "postgres://localhost:5432/nonexistent";

const { default: settingsRouter } = await import("./dist/routes/settings.mjs");

// PUT /admin/settings/:key exige rol superadmin (requireRole). Los casos
// cubiertos NO tocan la DB: autorización (403) y validación (400).
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
  app.use("/api", settingsRouter);
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

function put(base, path, body, role) {
  return fetch(`${base}/api${path}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      ...(role ? { "x-test-role": role } : {}),
    },
    body: JSON.stringify(body),
  });
}

test("PUT /admin/settings/:key sin sesión → 403", async () => {
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await put(base, "/admin/settings/chocofest_2026_place", { value: "Plaza" });
    assert.equal(res.status, 403);
  });
});

test("PUT /admin/settings/:key con rol insuficiente → 403", async () => {
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await put(
      base,
      "/admin/settings/chocofest_2026_place",
      { value: "Plaza" },
      "moderador",
    );
    assert.equal(res.status, 403);
  });
});

test("PUT /admin/settings/:key con valor no textual → 400", async () => {
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await put(
      base,
      "/admin/settings/chocofest_2026_place",
      { value: 123 },
      "superadmin",
    );
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error, "validation_error");
    assert.match(body.message, /texto/);
  });
});

test("PUT /admin/settings/:key sin value → 400", async () => {
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await put(base, "/admin/settings/chocofest_2026_place", {}, "superadmin");
    assert.equal(res.status, 400);
  });
});

test("PUT /admin/settings/:key con clave vacía → 400", async () => {
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await put(base, "/admin/settings/%20", { value: "x" }, "superadmin");
    assert.equal(res.status, 400);
  });
});

test("PUT /admin/settings/:key válido (superadmin) no es 400 ni 403", async () => {
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await put(
      base,
      "/admin/settings/chocofest_2026_place",
      { value: "Plaza de Armas", group: "chocofest" },
      "superadmin",
    );
    // Sin DB la operación falla en la capa de datos (500), pero la validación y
    // la autorización pasaron: eso es lo que cubre esta prueba.
    assert.notEqual(res.status, 400);
    assert.notEqual(res.status, 403);
  });
});

// ─── Campaña protagonista (Fase 1: solo campañas visibles) ───────────────────

test("PUT /admin/protagonist-campaign sin sesión → 403", async () => {
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await put(base, "/admin/protagonist-campaign", { campaignId: 1 });
    assert.equal(res.status, 403);
  });
});

test("PUT /admin/protagonist-campaign con rol insuficiente → 403", async () => {
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await put(base, "/admin/protagonist-campaign", { campaignId: 1 }, "moderador");
    assert.equal(res.status, 403);
  });
});

test("PUT /admin/protagonist-campaign con id no entero → 400 (no llega a la DB)", async () => {
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await put(
      base,
      "/admin/protagonist-campaign",
      { campaignId: "abc" },
      "superadmin",
    );
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error, "invalid_body");
  });
});

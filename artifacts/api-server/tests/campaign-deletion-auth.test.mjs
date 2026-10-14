import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";

process.env.DATABASE_URL ??= "postgres://localhost:5432/nonexistent";

const { default: campaignsRouter } = await import("./dist/routes/campaigns.mjs");

/**
 * App de prueba: inyecta `req.log` (pino en producción) y una sesión admin
 * cuando llega la cabecera `x-test-role`. Así se prueba la AUTORIZACIÓN real de
 * los endpoints de borrado (Fase 1.4) sin base de datos.
 */
function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.log = { error: () => {}, warn: () => {} };
    const role = req.headers["x-test-role"];
    if (typeof role === "string") {
      req.session = { adminUser: { id: 1, username: "admin", role } };
    }
    next();
  });
  app.use("/api", campaignsRouter);
  app.use((_err, _req, res, _next) => {
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

const call = (base, path, init = {}) => fetch(`${base}${path}`, init);

// ─── Autenticación: ningún endpoint de borrado es público ────────────────────

test("GET /api/campaigns/:id/deletion-diagnostic sin sesión → 401", async () => {
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await call(base, "/api/campaigns/1/deletion-diagnostic");
    assert.equal(res.status, 401);
  });
});

test("DELETE /api/campaigns/:id sin sesión → 401", async () => {
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await call(base, "/api/campaigns/1", { method: "DELETE" });
    assert.equal(res.status, 401);
  });
});

test("GET /api/campaigns/:id/test-purge/preview sin sesión → 401", async () => {
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await call(base, "/api/campaigns/1/test-purge/preview");
    assert.equal(res.status, 401);
  });
});

test("POST /api/campaigns/:id/test-purge sin sesión → 401", async () => {
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await call(base, "/api/campaigns/1/test-purge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: true, reason: "datos de prueba cargados por error" }),
    });
    assert.equal(res.status, 401);
  });
});

// ─── Autorización reforzada de la purga (Modalidad C) ────────────────────────

test("POST test-purge con rol administrador → 403 (exige superadmin)", async () => {
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await call(base, "/api/campaigns/1/test-purge", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-test-role": "administrador" },
      body: JSON.stringify({ confirm: true, reason: "datos de prueba cargados por error" }),
    });
    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.error, "forbidden");
  });
});

test("POST test-purge con superadmin SIN confirmación → 400", async () => {
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await call(base, "/api/campaigns/1/test-purge", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-test-role": "superadmin" },
      body: JSON.stringify({ reason: "datos de prueba cargados por error" }),
    });
    assert.equal(res.status, 400);
  });
});

test("POST test-purge con superadmin y motivo demasiado corto → 400", async () => {
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await call(base, "/api/campaigns/1/test-purge", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-test-role": "superadmin" },
      body: JSON.stringify({ confirm: true, reason: "corto" }),
    });
    assert.equal(res.status, 400);
  });
});

test("POST test-purge con superadmin y confirmación válida → pasa el gate (llega a DB → 500)", async () => {
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await call(base, "/api/campaigns/1/test-purge", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-test-role": "superadmin" },
      body: JSON.stringify({ confirm: true, reason: "datos de prueba cargados por error" }),
    });
    assert.notEqual(res.status, 401);
    assert.notEqual(res.status, 403);
    assert.equal(res.status, 500);
  });
});

// ─── Con sesión: los endpoints pasan el gate y llegan a la DB (dummy) ─────────

test("GET deletion-diagnostic con sesión admin → pasa el gate (500 de DB dummy)", async () => {
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await call(base, "/api/campaigns/1/deletion-diagnostic", {
      headers: { "x-test-role": "administrador" },
    });
    assert.notEqual(res.status, 401);
    assert.notEqual(res.status, 403);
    assert.equal(res.status, 500);
  });
});

test("DELETE /api/campaigns/:id con sesión admin → pasa el gate (500 de DB dummy)", async () => {
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await call(base, "/api/campaigns/1", {
      method: "DELETE",
      headers: { "x-test-role": "administrador" },
    });
    assert.notEqual(res.status, 401);
    assert.notEqual(res.status, 403);
    assert.equal(res.status, 500);
  });
});

test("id inválido → 400 antes de tocar la base", async () => {
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await call(base, "/api/campaigns/abc/deletion-diagnostic", {
      headers: { "x-test-role": "administrador" },
    });
    assert.equal(res.status, 400);
  });
});

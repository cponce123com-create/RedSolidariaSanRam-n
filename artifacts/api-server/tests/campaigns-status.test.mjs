import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";

// El bundle de campaigns.ts importa @workspace/db (exige DATABASE_URL al
// cargar; el pool no se conecta hasta la primera query → dummy basta).
process.env.DATABASE_URL ??= "postgres://localhost:5432/nonexistent";

const { default: campaignsRouter } = await import("./dist/routes/campaigns.mjs");

// App mínima con inyección de sesión admin por header de test y un `req.log`
// no-op (en producción lo provee pino-http). Los casos cubiertos NO tocan la
// DB: validación (400), autorización (401) y filtrado público (200 []).
function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.log = { error() {}, warn() {}, info() {}, debug() {} };
    if (req.headers["x-test-admin"] === "1") {
      req.session = { adminUser: { id: 1, username: "admin", role: "superadmin" } };
    }
    next();
  });
  app.use("/api", campaignsRouter);
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

function req(base, path, { method = "GET", body, admin = true } = {}) {
  return fetch(`${base}/api${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(admin ? { "x-test-admin": "1" } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

test("PATCH /campaigns/:id/status sin sesión → 401", async () => {
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await req(base, "/campaigns/1/status", {
      method: "PATCH",
      body: { status: "active" },
      admin: false,
    });
    assert.equal(res.status, 401);
  });
});

test("PATCH /campaigns/:id/status con estado inválido → 400", async () => {
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await req(base, "/campaigns/1/status", {
      method: "PATCH",
      body: { status: "activo" },
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error, "validation_error");
    assert.match(body.message, /Estado inválido/);
  });
});

test("PATCH /campaigns/:id/status sin body → 400", async () => {
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await req(base, "/campaigns/1/status", { method: "PATCH", body: {} });
    assert.equal(res.status, 400);
  });
});

test("PATCH /campaigns/:id/status con id no numérico → 400", async () => {
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await req(base, "/campaigns/abc/status", {
      method: "PATCH",
      body: { status: "active" },
    });
    assert.equal(res.status, 400);
  });
});

test("DELETE /campaigns/:id sin sesión → 401", async () => {
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await req(base, "/campaigns/1", { method: "DELETE", admin: false });
    assert.equal(res.status, 401);
  });
});

test("DELETE /campaigns/:id con id inválido → 400 (no llega a la DB)", async () => {
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await req(base, "/campaigns/0", { method: "DELETE" });
    assert.equal(res.status, 400);
  });
});

test("POST /campaigns con datos inválidos → 400", async () => {
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await req(base, "/campaigns", {
      method: "POST",
      body: { description: "sin título ni fecha" },
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error, "validation_error");
  });
});

test("POST /campaigns con estado fuera del ciclo de vida → 400", async () => {
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await req(base, "/campaigns", {
      method: "POST",
      body: {
        title: "Campaña de prueba",
        description: "Descripción suficientemente larga",
        startDate: "2026-01-01",
        status: "publicada",
      },
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.message, /Estado inválido/);
  });
});

test("GET /campaigns?status=draft (público) → [] sin tocar la DB", async () => {
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await req(base, "/campaigns?status=draft", { admin: false });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), []);
  });
});

test("GET /campaigns?status=archived (público) → [] sin tocar la DB", async () => {
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await req(base, "/campaigns?status=archived", { admin: false });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), []);
  });
});

test("GET /campaigns/:id con id inválido → 400", async () => {
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await req(base, "/campaigns/xyz", { admin: false });
    assert.equal(res.status, 400);
  });
});

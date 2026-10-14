import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";

// donors.ts importa @workspace/db (exige DATABASE_URL al cargar; el pool no se
// conecta hasta la primera query → dummy basta).
process.env.DATABASE_URL ??= "postgres://localhost:5432/nonexistent";

const { default: donorsRouter } = await import("./dist/routes/donors.mjs");

// Los perfiles de donante son PRIVADOS: se verifica autorización (401/403) y
// validación (400). Los casos NO tocan la DB.
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
  app.use("/api", donorsRouter);
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

function call(base, path, { method = "GET", body, role } = {}) {
  return fetch(`${base}/api${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(role ? { "x-test-role": role } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

test("GET /admin/donors sin sesión → 401", async () => {
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await call(base, "/admin/donors");
    assert.equal(res.status, 401);
  });
});

test("GET /admin/donors con rol insuficiente → 403", async () => {
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await call(base, "/admin/donors", { role: "moderador" });
    assert.equal(res.status, 403);
  });
});

test("GET /admin/donors/:id con id inválido → 400", async () => {
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await call(base, "/admin/donors/abc", { role: "superadmin" });
    assert.equal(res.status, 400);
  });
});

test("POST /admin/donors sin nombre → 400", async () => {
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await call(base, "/admin/donors", {
      method: "POST",
      body: { email: "a@b.com" },
      role: "superadmin",
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error, "validation_error");
  });
});

test("POST /admin/donors con tipo inválido → 400", async () => {
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await call(base, "/admin/donors", {
      method: "POST",
      body: { name: "Empresa X", type: "ong" },
      role: "superadmin",
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.message, /Tipo inválido/);
  });
});

test("PUT /admin/donors/:id con id inválido → 400", async () => {
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await call(base, "/admin/donors/0", {
      method: "PUT",
      body: { name: "X" },
      role: "superadmin",
    });
    assert.equal(res.status, 400);
  });
});

test("PATCH /admin/donations/:id/reconcile sin sesión → 401", async () => {
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await call(base, "/admin/donations/1/reconcile", { method: "PATCH" });
    assert.equal(res.status, 401);
  });
});

test("PATCH /admin/donations/:id/reconcile con id inválido → 400", async () => {
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await call(base, "/admin/donations/xyz/reconcile", {
      method: "PATCH",
      role: "superadmin",
    });
    assert.equal(res.status, 400);
  });
});

test("GET /admin/donations/duplicates sin sesión → 401", async () => {
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await call(base, "/admin/donations/duplicates");
    assert.equal(res.status, 401);
  });
});

test("GET /admin/donations/duplicates (superadmin) pasa autorización y validación", async () => {
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await call(base, "/admin/donations/duplicates", { role: "superadmin" });
    // Sin DB falla en la capa de datos (500): lo cubierto es auth + ruta.
    assert.notEqual(res.status, 400);
    assert.notEqual(res.status, 401);
    assert.notEqual(res.status, 403);
  });
});

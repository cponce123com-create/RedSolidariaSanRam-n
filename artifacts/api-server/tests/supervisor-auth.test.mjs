import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";

// supervisor.ts importa @workspace/db (exige DATABASE_URL al cargar).
process.env.DATABASE_URL ??= "postgres://localhost:5432/nonexistent";

const { default: supervisorRouter } = await import("./dist/routes/supervisor.mjs");

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.log = { error() {}, warn() {}, info() {}, debug() {} };
    const role = req.headers["x-test-role"];
    if (typeof role === "string" && role) {
      req.session = { adminUser: { id: 1, username: "u", role } };
    }
    next();
  });
  app.use("/api", supervisorRouter);
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

function call(base, path, { role, method = "GET", body } = {}) {
  return fetch(`${base}/api${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(role ? { "x-test-role": role } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

test("listar observaciones sin sesión → 401", async () => {
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await call(base, "/admin/observations");
    assert.equal(res.status, 401);
  });
});

test("listar observaciones como moderador → 403", async () => {
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await call(base, "/admin/observations", { role: "moderador" });
    assert.equal(res.status, 403);
  });
});

test("el SUPERVISOR puede listar observaciones (consulta)", async () => {
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await call(base, "/admin/observations", { role: "supervisor" });
    assert.notEqual(res.status, 401);
    assert.notEqual(res.status, 403);
  });
});

test("el SUPERVISOR puede dejar una observación (pasa autorización)", async () => {
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await call(base, "/admin/observations", {
      role: "supervisor",
      method: "POST",
      body: { entityType: "donation", entityId: "1", body: "Revisar comprobante." },
    });
    assert.notEqual(res.status, 401);
    assert.notEqual(res.status, 403);
  });
});

test("el SUPERVISOR no puede resolver observaciones → 403", async () => {
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await call(base, "/admin/observations/1/resolve", {
      role: "supervisor",
      method: "PATCH",
    });
    assert.equal(res.status, 403);
  });
});

test("el ADMINISTRADOR puede resolver (pasa autorización)", async () => {
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await call(base, "/admin/observations/1/resolve", {
      role: "administrador",
      method: "PATCH",
    });
    assert.notEqual(res.status, 401);
    assert.notEqual(res.status, 403);
  });
});

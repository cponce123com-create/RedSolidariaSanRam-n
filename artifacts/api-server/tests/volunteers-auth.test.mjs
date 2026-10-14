import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";

// volunteers.ts importa @workspace/db (exige DATABASE_URL al cargar).
process.env.DATABASE_URL ??= "postgres://localhost:5432/nonexistent";

const { default: volunteersRouter } = await import("./dist/routes/volunteers.mjs");

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
  app.use("/api", volunteersRouter);
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

test("listar postulaciones sin sesión → 401", async () => {
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await call(base, "/admin/volunteers");
    assert.equal(res.status, 401);
  });
});

test("listar postulaciones con rol sin permiso (supervisor) → 403", async () => {
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await call(base, "/admin/volunteers", { role: "supervisor" });
    assert.equal(res.status, 403);
  });
});

test("el moderador (comunidad) pasa autorización", async () => {
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await call(base, "/admin/volunteers?status=pending", { role: "moderador" });
    assert.notEqual(res.status, 401);
    assert.notEqual(res.status, 403);
  });
});

test("ficha con ID inválido → 400 (sin tocar la base)", async () => {
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await call(base, "/admin/volunteers/abc", { role: "moderador" });
    assert.equal(res.status, 400);
  });
});

test("cambio de estado con ID inválido → 400", async () => {
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await call(base, "/admin/volunteers/abc", {
      role: "moderador",
      method: "PATCH",
      body: { status: "approved" },
    });
    assert.equal(res.status, 400);
  });
});

test("cambio de estado con estado no permitido → 400", async () => {
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await call(base, "/admin/volunteers/1", {
      role: "moderador",
      method: "PATCH",
      body: { status: "aprobado" },
    });
    assert.equal(res.status, 400);
  });
});

test("registro público con datos inválidos → 400 (sin tocar la base)", async () => {
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await call(base, "/volunteers", { method: "POST", body: { name: "Ana" } });
    assert.equal(res.status, 400);
  });
});

test("consulta de estado con token demasiado corto → 404", async () => {
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await call(base, "/volunteers/status/corto");
    assert.equal(res.status, 404);
  });
});

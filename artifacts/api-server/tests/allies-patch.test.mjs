import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";

// El bundle de allies.ts importa @workspace/db (exige DATABASE_URL al cargar;
// el pool no se conecta hasta la primera query → dummy basta).
process.env.DATABASE_URL ??= "postgres://localhost:5432/nonexistent";

const { default: alliesRouter } = await import("./dist/routes/allies.mjs");
// El gate global de /admin/* vive en routes/index.ts (producción); lo
// replicamos aquí para que el router aislado exija sesión como en el app real.
const { requireAdmin } = await import("./dist/middleware/require-admin.mjs");
const { adminActionLimiter } = await import("./dist/middleware/rate-limit.mjs");

// App mínima con inyección de sesión admin por header de test.
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
  app.use("/api", alliesRouter);
  // Error handler mínimo: con validación OK pero sin DB real, el handler falla
  // en la query y responde 500 (nunca 401/403).
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

async function patch(base, body, admin = true) {
  return fetch(`${base}/api/admin/allies/1`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...(admin ? { "x-test-admin": "1" } : {}),
    },
    body: JSON.stringify(body),
  });
}

test("PATCH /admin/allies/:id sin sesión → 401", async () => {
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await patch(base, { name: "X" }, false);
    assert.equal(res.status, 401);
  });
});

test("PATCH /admin/allies/:id con tipos inválidos → 400 (validación Zod activa)", async () => {
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await patch(base, { name: 123 });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error, "Datos inválidos");
    assert.ok(Array.isArray(body.details));
  });
});

test("PATCH /admin/allies/:id con claves desconocidas → se descartan (no 400)", async () => {
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await patch(base, { name: "Nuevo aliado", evilField: true });
    // La clave desconocida se elimina: la validación pasa (luego falla la DB).
    assert.notEqual(res.status, 400);
  });
});

test("PATCH /admin/allies/:id intentando sobrescribir id → se descarta (no 400)", async () => {
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await patch(base, { id: 999, name: "Aliado X" });
    // id no existe en el schema (se omite): se descarta → anti mass-assignment.
    assert.notEqual(res.status, 400);
  });
});

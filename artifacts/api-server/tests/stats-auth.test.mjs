import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";

// El bundle de stats.ts importa @workspace/db, que exige DATABASE_URL al cargar
// el módulo. El pool de pg no se conecta hasta la primera query, así que basta
// un valor dummy: ninguna consulta llega a ejecutarse en los tests de auth.
process.env.DATABASE_URL ??= "postgres://localhost:5432/nonexistent";

const { default: statsRouter } = await import("./dist/routes/stats.mjs");

// App mínima que monta el router de stats tal como lo hace routes/index.ts
// (bajo /api). Permite inyectar una sesión admin simulada por header de test.
function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    if (req.headers["x-test-admin"] === "1") {
      req.session = { adminUser: { id: 1, username: "admin", role: "superadmin" } };
    }
    next();
  });
  app.use("/api", statsRouter);
  // Error handler mínimo: con sesión válida pero sin DB real, el handler de PUT
  // falla en la query y responde 400/500 (nunca 401).
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

test("PUT /api/stats sin sesión admin → 401 (regresión de la vulnerabilidad)", async () => {
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/stats`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ childrenHelped: 999 }),
    });
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.error, "unauthorized");
  });
});

test("PUT /api/stats con sesión admin → no devuelve 401 (pasa el middleware)", async () => {
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/stats`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", "x-test-admin": "1" },
      body: JSON.stringify({ childrenHelped: 999 }),
    });
    // Sin DB real el handler falla (400/500) o devuelve 200 si hay DB local;
    // lo importante es que la petición autenticada NUNCA es rechazada con 401.
    assert.notEqual(res.status, 401);
  });
});

test("GET /api/stats sigue siendo público (sin 401)", async () => {
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/stats`);
    assert.notEqual(res.status, 401);
  });
});

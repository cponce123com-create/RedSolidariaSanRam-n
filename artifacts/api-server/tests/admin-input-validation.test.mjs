import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";

process.env.DATABASE_URL ??= "postgres://localhost:5432/nonexistent";

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

function buildApp(router) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    // pino-http provee req.log en producción; aquí se usa un stub para que los
    // handlers que loguean no crasheen.
    req.log = { error: () => {} };
    next();
  });
  app.use("/api", router);
  app.use((err, _req, res, _next) => {
    res.status(500).json({ error: "test_server_error" });
  });
  return app;
}

// Import con query único: el bundle de la ruta incluye los limiters inline y
// así el contador de hits no se arrastra entre tests del mismo archivo.
function fresh(routeFile, tag) {
  return import(`./dist/routes/${routeFile}.mjs?${tag}=${Date.now()}-${Math.random()}`);
}

test("PATCH /api/admin/volunteers/:id con status inválido → 400 (schema Zod antes de DB)", async () => {
  const mod = await fresh("volunteers", "volunteers");
  await withServer(buildApp(mod.default), async (base) => {
    const res = await fetch(`${base}/api/admin/volunteers/1`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "hacked", adminNotes: "nota" }),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error, "validation_error");
    assert.equal(body.message, "Datos inválidos");
  });
});

test("PATCH /api/admin/volunteers/:id con adminNotes de tipo inválido → 400", async () => {
  const mod = await fresh("volunteers", "volunteers2");
  await withServer(buildApp(mod.default), async (base) => {
    const res = await fetch(`${base}/api/admin/volunteers/1`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "approved", adminNotes: 123 }),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error, "validation_error");
  });
});

test("PATCH /api/admin/adoption-requests/:id con status inválido → 400 (schema Zod antes de DB)", async () => {
  const mod = await fresh("pets", "adoption-requests");
  await withServer(buildApp(mod.default), async (base) => {
    const res = await fetch(`${base}/api/admin/adoption-requests/1`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "hacked" }),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error, "validation_error");
    assert.equal(body.message, "Datos inválidos");
  });
});

test("POST /api/admin/reports/:id/convert con tipos inválidos → 400 (schema Zod antes de DB)", async () => {
  const mod = await fresh("community-reports", "convert");
  await withServer(buildApp(mod.default), async (base) => {
    const res = await fetch(`${base}/api/admin/reports/1/convert`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ goal: "mil", title: 123 }),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error, "validation_error");
    assert.equal(body.message, "Datos inválidos");
  });
});

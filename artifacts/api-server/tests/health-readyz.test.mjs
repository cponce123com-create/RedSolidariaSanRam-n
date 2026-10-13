import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";

process.env.DATABASE_URL ??= "postgres://localhost:5432/nonexistent";

const { default: healthRouter } = await import("./dist/routes/health.mjs");

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

function buildApp() {
  const app = express();
  app.use(healthRouter);
  app.use((err, _req, res, _next) => {
    res.status(500).json({ error: "test_server_error" });
  });
  return app;
}

test("GET /healthz → 200 {status:ok} (liveness, no toca la DB)", async () => {
  await withServer(buildApp(), async (base) => {
    const res = await fetch(`${base}/healthz`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, "ok");
  });
});

test("GET /readyz sin DB disponible → 503 (readiness detecta la caída)", async () => {
  await withServer(buildApp(), async (base) => {
    const res = await fetch(`${base}/readyz`);
    assert.equal(res.status, 503);
    const body = await res.json();
    assert.equal(body.status, "unavailable");
    assert.equal(body.db, "error");
  });
});

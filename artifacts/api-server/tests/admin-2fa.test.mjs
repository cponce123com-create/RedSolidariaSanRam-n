import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";

// El bundle de admin-2fa.ts importa @workspace/db (exige DATABASE_URL al cargar;
// el pool no se conecta hasta la primera query → dummy basta).
process.env.DATABASE_URL ??= "postgres://localhost:5432/nonexistent";

const { default: twoFactorRouter } = await import("./dist/routes/admin-2fa.mjs");

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    if (req.headers["x-test-admin"] === "1") {
      req.session = { adminUser: { id: 1, username: "admin", role: "superadmin" } };
    }
    next();
  });
  app.use("/api", twoFactorRouter);
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

async function post(base, path, body, admin = false) {
  return fetch(`${base}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(admin ? { "x-test-admin": "1" } : {}),
    },
    body: JSON.stringify(body),
  });
}

test("POST /admin/2fa/login con body inválido → 400 (antes de tocar la DB)", async () => {
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await post(base, "/api/admin/2fa/login", {});
    assert.equal(res.status, 400);
  });
});

test("POST /admin/2fa/login con código no numérico → 400", async () => {
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await post(base, "/api/admin/2fa/login", { userId: 1, code: "abc123" });
    assert.equal(res.status, 400);
  });
});

test("POST /admin/2fa/setup sin sesión → 401", async () => {
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await post(base, "/api/admin/2fa/setup", {});
    assert.equal(res.status, 401);
  });
});

test("POST /admin/2fa/verify sin sesión → 401", async () => {
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await post(base, "/api/admin/2fa/verify", { code: "123456" });
    assert.equal(res.status, 401);
  });
});

test("POST /admin/2fa/disable sin sesión → 401", async () => {
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await post(base, "/api/admin/2fa/disable", { code: "123456" });
    assert.equal(res.status, 401);
  });
});

test("GET /admin/2fa/status sin sesión → 401", async () => {
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/admin/2fa/status`);
    assert.equal(res.status, 401);
  });
});

test("POST /admin/users/1/2fa/reset sin sesión → 401", async () => {
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await post(base, "/api/admin/users/1/2fa/reset", {});
    assert.equal(res.status, 401);
  });
});

test("POST /admin/users/1/2fa/reset con sesión admin → no 401 (rol se evalúa en el handler)", async () => {
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await post(base, "/api/admin/users/1/2fa/reset", {}, true);
    // Con sesión superadmin el handler intenta la DB (500) o responde 200;
    // sin sesión o sin rol daría 401/403 — ninguno de los dos debe ocurrir aquí.
    assert.notEqual(res.status, 401);
  });
});

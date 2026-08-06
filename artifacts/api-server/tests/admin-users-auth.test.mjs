import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";

process.env.DATABASE_URL ??= "postgres://localhost:5432/nonexistent";

const { default: adminUsersRouter } = await import("./dist/routes/admin-users.mjs");
// El gate global de /admin/* vive en routes/index.ts (producción); lo
// replicamos aquí para que el router aislado exija sesión como en el app real.
const { requireAdmin } = await import("./dist/middleware/require-admin.mjs");
const { adminActionLimiter } = await import("./dist/middleware/rate-limit.mjs");

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    // "1" = superadmin, "2" = moderador (sin rol superadmin)
    if (req.headers["x-test-admin"] === "1") {
      req.session = { adminUser: { id: 1, username: "super", role: "superadmin" } };
    } else if (req.headers["x-test-admin"] === "2") {
      req.session = { adminUser: { id: 2, username: "mod", role: "moderador" } };
    }
    next();
  });
  app.use("/api/admin", requireAdmin, adminActionLimiter);
  app.use("/api", adminUsersRouter);
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

test("GET /api/admin/users sin sesión → 401 (requireAdmin)", async () => {
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/admin/users`);
    assert.equal(res.status, 401);
  });
});

test("GET /api/admin/users con sesión no-superadmin → 403", async () => {
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/admin/users`, { headers: { "x-test-admin": "2" } });
    assert.equal(res.status, 403);
  });
});

test("POST /api/admin/users con sesión superadmin y body inválido → 400 (schema Zod)", async () => {
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/admin/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-test-admin": "1" },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 400);
  });
});

test("POST /api/admin/users sin sesión → 401", async () => {
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/admin/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 401);
  });
});

test("PATCH /api/admin/users/1 con sesión no-superadmin → 403", async () => {
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/admin/users/1`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-test-admin": "2" },
      body: JSON.stringify({ name: "X" }),
    });
    assert.equal(res.status, 403);
  });
});

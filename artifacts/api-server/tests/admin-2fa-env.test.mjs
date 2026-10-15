// 2FA del superadmin de entorno (V7.2.3) — autorización y validación HTTP.
//
// Regresión cubierta: /admin/2fa/* respondía 404 al superadmin de respaldo
// («Usuario no encontrado») porque buscaba una fila de admin_users que no existe.
// Ahora la sesión id 0 se resuelve como la cuenta de entorno, así que las rutas
// dejan de devolver 404 y llegan a operar (con la base ficticia, 500).
import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";

process.env.DATABASE_URL ??= "postgres://localhost:5432/nonexistent";

const { default: twoFactorRouter } = await import("./dist/routes/admin-2fa.mjs");

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.log = { error: () => {}, warn: () => {}, info: () => {}, debug: () => {} };
    const role = req.headers["x-test-role"];
    if (typeof role === "string" && role.length > 0) {
      req.session = {
        adminUser: {
          // `x-test-admin-id: 0` simula el superadmin de respaldo por entorno.
          id: Number(req.headers["x-test-admin-id"] ?? 1),
          username: req.headers["x-test-username"] ?? "tester",
          name: "Tester",
          role,
        },
      };
    }
    next();
  });
  app.use("/api", twoFactorRouter);
  app.use((_err, _req, res, _next) => res.status(500).json({ error: "test_server_error" }));
  return app;
}

async function withServer(fn) {
  const app = buildApp();
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const { port } = server.address();
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function call(base, path, { role, id, username, method = "POST", body } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (role) {
    headers["x-test-role"] = role;
    if (id !== undefined) headers["x-test-admin-id"] = String(id);
    if (username !== undefined) headers["x-test-username"] = username;
  }
  return fetch(`${base}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const ENV_SESSION = { role: "superadmin", id: 0, username: "e2e-admin" };

// ─── La sesión de entorno deja de ser un 404 ─────────────────────────────────

test("status del superadmin de entorno ya NO responde 404", async () => {
  await withServer(async (base) => {
    const res = await call(base, "/api/admin/2fa/status", { ...ENV_SESSION, method: "GET" });
    // Resuelve la cuenta de entorno y consulta la base: 500 con la URL ficticia.
    assert.notEqual(res.status, 404, "el 404 era el bug: no hay fila que buscar");
    assert.equal(res.status, 500);
  });
});

test("setup del superadmin de entorno ya NO responde 404 (era el bug reportado)", async () => {
  await withServer(async (base) => {
    const res = await call(base, "/api/admin/2fa/setup", ENV_SESSION);
    assert.notEqual(res.status, 404);
    assert.equal(res.status, 500);
  });
});

test("verify del superadmin de entorno ya NO responde 404", async () => {
  await withServer(async (base) => {
    const res = await call(base, "/api/admin/2fa/verify", {
      ...ENV_SESSION,
      body: { code: "123456" },
    });
    assert.notEqual(res.status, 404);
    assert.equal(res.status, 500);
  });
});

test("disable del superadmin de entorno ya NO responde 404", async () => {
  await withServer(async (base) => {
    const res = await call(base, "/api/admin/2fa/disable", {
      ...ENV_SESSION,
      body: { code: "123456" },
    });
    assert.notEqual(res.status, 404);
    assert.equal(res.status, 500);
  });
});

// ─── Autorización y validación ───────────────────────────────────────────────

test("las rutas de 2FA siguen exigiendo sesión (401 sin ella)", async () => {
  await withServer(async (base) => {
    assert.equal((await call(base, "/api/admin/2fa/status", { method: "GET" })).status, 401);
    assert.equal((await call(base, "/api/admin/2fa/setup")).status, 401);
    assert.equal((await call(base, "/api/admin/2fa/verify", { body: { code: "123456" } })).status, 401);
    assert.equal((await call(base, "/api/admin/2fa/disable", { body: { code: "123456" } })).status, 401);
  });
});

test("un administrador normal sigue pudiendo gestionar SU 2FA (no el del entorno)", async () => {
  await withServer(async (base) => {
    const res = await call(base, "/api/admin/2fa/status", { role: "administrador", id: 5, method: "GET" });
    // Su cuenta es una fila: busca en la base (500 con la URL ficticia).
    assert.equal(res.status, 500);
  });
});

test("un código con formato inválido se rechaza antes de tocar la base (400)", async () => {
  await withServer(async (base) => {
    for (const code of ["abc", "12345", "1234567", ""]) {
      const res = await call(base, "/api/admin/2fa/verify", { ...ENV_SESSION, body: { code } });
      assert.equal(res.status, 400, `code=${JSON.stringify(code)}`);
    }
    const disable = await call(base, "/api/admin/2fa/disable", { ...ENV_SESSION, body: { code: "x" } });
    assert.equal(disable.status, 400);
  });
});

// ─── Paso 2 del login ────────────────────────────────────────────────────────

test("el paso 2 del login exige userId y código de 6 dígitos (400)", async () => {
  await withServer(async (base) => {
    assert.equal((await call(base, "/api/admin/2fa/login", { body: {} })).status, 400);
    assert.equal((await call(base, "/api/admin/2fa/login", { body: { userId: 0 } })).status, 400);
    assert.equal(
      (await call(base, "/api/admin/2fa/login", { body: { userId: 0, code: "abc" } })).status,
      400,
    );
  });
});

test("el paso 2 acepta userId 0 (superadmin de entorno) y consulta su 2FA", async () => {
  await withServer(async (base) => {
    const res = await call(base, "/api/admin/2fa/login", { body: { userId: 0, code: "123456" } });
    // Llega a leer el estado del 2FA del entorno (500 con la URL ficticia); lo que
    // NO puede es ignorar el caso con un 401 inmediato por «usuario inexistente».
    assert.equal(res.status, 500);
  });
});

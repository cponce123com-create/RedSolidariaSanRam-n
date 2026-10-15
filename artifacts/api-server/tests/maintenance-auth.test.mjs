// Mantenimiento → Limpieza de datos DEMO (V9.1) — autorización y validación HTTP.
//
// Estas rutas son la puerta de la limpieza integral: solo el superadmin, y la
// declaración DEMO / la protección exigen reautenticación y motivo. La validación
// ocurre ANTES de tocar la base, así que un cuerpo mal formado no consulta nada.
import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";

process.env.DATABASE_URL ??= "postgres://localhost:5432/nonexistent";

const { default: maintenanceRouter } = await import("./dist/routes/maintenance.mjs");

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.log = { error: () => {}, warn: () => {}, info: () => {}, debug: () => {} };
    const role = req.headers["x-test-role"];
    if (typeof role === "string" && role.length > 0) {
      req.session = {
        adminUser: {
          id: Number(req.headers["x-test-admin-id"] ?? 1),
          username: req.headers["x-test-username"] ?? "tester",
          name: "Tester",
          role,
        },
      };
    }
    next();
  });
  app.use("/api", maintenanceRouter);
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

async function call(base, path, { role, id, method = "POST", body } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (role) {
    headers["x-test-role"] = role;
    if (id !== undefined) headers["x-test-admin-id"] = String(id);
  }
  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: res.status, body: json, text };
}

const SUPER = { role: "superadmin", id: 0 };
const REASON = "Limpieza de datos de prueba de la plataforma";

// ─── Solo superadmin ─────────────────────────────────────────────────────────

test("el inventario exige superadmin (403 para administrador, 401 sin sesión)", async () => {
  await withServer(async (base) => {
    assert.equal((await call(base, "/api/admin/maintenance/inventory", { method: "GET" })).status, 401);
    assert.equal(
      (await call(base, "/api/admin/maintenance/inventory", { role: "administrador", method: "GET" }))
        .status,
      403,
    );
    assert.equal(
      (await call(base, "/api/admin/maintenance/reconciliation", { role: "moderador", method: "GET" }))
        .status,
      403,
    );
  });
});

test("declarar DEMO y proteger exigen superadmin", async () => {
  await withServer(async (base) => {
    const declare = await call(base, "/api/admin/maintenance/declare-demo", {
      role: "administrador",
      body: { confirm: true, reason: REASON, password: "x", campaignIds: [1] },
    });
    assert.equal(declare.status, 403);
    const protect = await call(base, "/api/admin/maintenance/protect-campaigns", {
      role: "administrador",
      body: { confirm: true, reason: REASON, password: "x" },
    });
    assert.equal(protect.status, 403);
  });
});

// ─── Validación antes de tocar la base ───────────────────────────────────────

test("declarar DEMO sin confirmación, sin motivo o sin campañas → 400 sin tocar la base", async () => {
  await withServer(async (base) => {
    const noConfirm = await call(base, "/api/admin/maintenance/declare-demo", {
      ...SUPER,
      body: { reason: REASON, password: "x", campaignIds: [1] },
    });
    assert.equal(noConfirm.status, 400);
    assert.equal(noConfirm.body.code, "confirmation_required");

    const noReason = await call(base, "/api/admin/maintenance/declare-demo", {
      ...SUPER,
      body: { confirm: true, reason: "corto", password: "x", campaignIds: [1] },
    });
    assert.equal(noReason.status, 400);
    assert.equal(noReason.body.code, "reason_required");

    const noIds = await call(base, "/api/admin/maintenance/declare-demo", {
      ...SUPER,
      body: { confirm: true, reason: REASON, password: "x", campaignIds: [] },
    });
    assert.equal(noIds.status, 400);
  });
});

test("proteger campañas sin confirmación o sin motivo → 400", async () => {
  await withServer(async (base) => {
    const noConfirm = await call(base, "/api/admin/maintenance/protect-campaigns", {
      ...SUPER,
      body: { reason: REASON, password: "x" },
    });
    assert.equal(noConfirm.status, 400);
    assert.equal(noConfirm.body.code, "confirmation_required");

    const noReason = await call(base, "/api/admin/maintenance/protect-campaigns", {
      ...SUPER,
      body: { confirm: true, reason: "", password: "x" },
    });
    assert.equal(noReason.status, 400);
    assert.equal(noReason.body.code, "reason_required");
  });
});

// ─── Reautenticación ─────────────────────────────────────────────────────────

test("con la petición bien formada se exige reautenticación (401, no 400)", async () => {
  await withServer(async (base) => {
    const declare = await call(base, "/api/admin/maintenance/declare-demo", {
      ...SUPER,
      body: { confirm: true, reason: REASON, password: "", campaignIds: [1] },
    });
    assert.equal(declare.status, 401);
    // Sin contraseña el código es «reauth_required» (falta el dato), no
    // «reauth_failed» (dato incorrecto): la interfaz distingue ambos casos.
    assert.equal(declare.body.code, "reauth_required");

    const protect = await call(base, "/api/admin/maintenance/protect-campaigns", {
      ...SUPER,
      body: { confirm: true, reason: REASON, password: "incorrecta" },
    });
    assert.equal(protect.status, 401);
  });
});

// ─── Lectura ─────────────────────────────────────────────────────────────────

test("el inventario y la conciliación del superadmin llegan a consultar la base", async () => {
  await withServer(async (base) => {
    // Con la URL ficticia fallan al leer (500), pero NO por autorización: eso
    // demuestra que la ruta está montada y que el superadmin tiene paso.
    assert.equal((await call(base, "/api/admin/maintenance/inventory", { ...SUPER, method: "GET" })).status, 500);
    assert.equal(
      (await call(base, "/api/admin/maintenance/reconciliation", { ...SUPER, method: "GET" })).status,
      500,
    );
    assert.equal(
      (await call(base, "/api/admin/maintenance/reconciliation?format=csv", { ...SUPER, method: "GET" }))
        .status,
      500,
    );
  });
});

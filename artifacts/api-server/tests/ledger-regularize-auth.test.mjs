// Autorización y validación de la regularización del libro contable (Fase 2,
// V7.1). La operación apila asientos compensatorios y exige autorización
// reforzada (superadmin), confirmación, motivo y evidencia documental.
import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";

process.env.DATABASE_URL ??= "postgres://localhost:5432/nonexistent";

const { default: ledgerAuditRouter } = await import("./dist/routes/ledger-audit.mjs");

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.log = { error: () => {}, warn: () => {} };
    const role = req.headers["x-test-role"];
    if (typeof role === "string") {
      req.session = { adminUser: { id: 1, username: "admin", role } };
    }
    next();
  });
  app.use("/api", ledgerAuditRouter);
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

const call = (base, path, init = {}) => fetch(`${base}${path}`, init);
const json = (body) => ({
  "Content-Type": "application/json",
  ...body,
});

const validBody = {
  confirm: true,
  donationIds: [1],
  reason: "Asiento faltante detectado en la conciliación de octubre",
  evidenceRef: "voucher-2026-10",
};

// ─── Autenticación ───────────────────────────────────────────────────────────

test("POST /api/admin/ledger/regularize sin sesión → 401", async () => {
  await withServer(buildApp(), async (base) => {
    const res = await call(base, "/api/admin/ledger/regularize", {
      method: "POST",
      headers: json({}),
      body: JSON.stringify(validBody),
    });
    assert.equal(res.status, 401);
  });
});

test("GET /api/admin/ledger/regularize/preview sin sesión → 401", async () => {
  await withServer(buildApp(), async (base) => {
    const res = await call(base, "/api/admin/ledger/regularize/preview");
    assert.equal(res.status, 401);
  });
});

// ─── Autorización reforzada (solo superadmin) ────────────────────────────────

test("POST regularize con rol administrador → 403 (exige superadmin)", async () => {
  await withServer(buildApp(), async (base) => {
    const res = await call(base, "/api/admin/ledger/regularize", {
      method: "POST",
      headers: json({ "x-test-role": "administrador" }),
      body: JSON.stringify(validBody),
    });
    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.error, "forbidden");
  });
});

test("GET regularize/preview con rol supervisor → 403", async () => {
  await withServer(buildApp(), async (base) => {
    const res = await call(base, "/api/admin/ledger/regularize/preview", {
      headers: { "x-test-role": "supervisor" },
    });
    assert.equal(res.status, 403);
  });
});

// ─── Validación de la solicitud (antes de tocar la base) ─────────────────────

test("POST regularize sin confirmación → 400", async () => {
  await withServer(buildApp(), async (base) => {
    const res = await call(base, "/api/admin/ledger/regularize", {
      method: "POST",
      headers: json({ "x-test-role": "superadmin" }),
      body: JSON.stringify({ ...validBody, confirm: false }),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error, "validation_error");
  });
});

test("POST regularize con motivo corto → 400", async () => {
  await withServer(buildApp(), async (base) => {
    const res = await call(base, "/api/admin/ledger/regularize", {
      method: "POST",
      headers: json({ "x-test-role": "superadmin" }),
      body: JSON.stringify({ ...validBody, reason: "corto" }),
    });
    assert.equal(res.status, 400);
  });
});

test("POST regularize sin evidencia → 400", async () => {
  await withServer(buildApp(), async (base) => {
    const res = await call(base, "/api/admin/ledger/regularize", {
      method: "POST",
      headers: json({ "x-test-role": "superadmin" }),
      body: JSON.stringify({ ...validBody, evidenceRef: "" }),
    });
    assert.equal(res.status, 400);
  });
});

test("POST regularize con superadmin y solicitud válida → pasa el gate (llega a DB → 500)", async () => {
  await withServer(buildApp(), async (base) => {
    const res = await call(base, "/api/admin/ledger/regularize", {
      method: "POST",
      headers: json({ "x-test-role": "superadmin" }),
      body: JSON.stringify(validBody),
    });
    assert.notEqual(res.status, 401);
    assert.notEqual(res.status, 403);
    assert.equal(res.status, 500);
  });
});

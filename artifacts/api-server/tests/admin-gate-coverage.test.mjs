// Cobertura del gate global de autorización (Fase 3, hallazgo SEC-08).
//
// El router monta `router.use("/admin", requireAdmin, adminActionLimiter)` como
// ÚNICO punto de control de todo /admin/* que no sea de autenticación. Esta
// prueba comprueba que el gate es un comodín real: CUALQUIER ruta administrativa
// (incluidas las que no existen) exige sesión, y que las rutas de autenticación
// (login) siguen siendo públicas.
import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";

process.env.DATABASE_URL ??= "postgres://localhost:5432/nonexistent";

const { default: router } = await import("./dist/routes/index.mjs");

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.log = { error: () => {}, warn: () => {}, info: () => {} };
    next();
  });
  app.use("/api", router);
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

// Rutas administrativas representativas de TODOS los routers montados tras el
// gate. Todas deben exigir sesión (401) antes de tocar la base.
const ADMIN_PATHS = [
  "/api/admin/dashboard",
  "/api/admin/users",
  "/api/admin/settings",
  "/api/admin/ledger/audit",
  "/api/admin/ledger/regularize/preview",
  "/api/admin/reports",
  "/api/admin/reports/donations.csv",
  "/api/admin/audit-logs",
  "/api/admin/donations/duplicates",
  "/api/admin/donors",
  "/api/admin/certificates",
  "/api/admin/volunteers",
  "/api/admin/volunteer-teams",
  "/api/admin/observations",
  "/api/admin/pets",
  "/api/admin/allies",
  "/api/admin/faq",
  "/api/admin/adoption-requests",
  "/api/admin/protagonist-campaign",
  // Identidad institucional (Fase 3): la parte administrativa exige sesión.
  "/api/admin/institutional-identity",
  // Ruta inexistente: el gate debe ser un comodín y responder 401 igualmente.
  "/api/admin/esta-ruta-no-existe",
];

for (const path of ADMIN_PATHS) {
  test(`GET ${path} sin sesión → 401 (gate global de /admin)`, async () => {
    await withServer(buildApp(), async (base) => {
      const res = await fetch(`${base}${path}`);
      assert.equal(res.status, 401);
      const body = await res.json();
      assert.equal(body.error, "unauthorized");
    });
  });
}

test("POST /api/admin/ledger/regularize sin sesión → 401", async () => {
  await withServer(buildApp(), async (base) => {
    const res = await fetch(`${base}/api/admin/ledger/regularize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: true, donationIds: [1], reason: "motivo largo", evidenceRef: "x" }),
    });
    assert.equal(res.status, 401);
  });
});

test("POST /api/admin/login es público (no exige sesión previa)", async () => {
  await withServer(buildApp(), async (base) => {
    const res = await fetch(`${base}/api/admin/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    // Sin credenciales la validación responde 400; lo importante es que NO es
    // 401 (la ruta de login está montada ANTES del gate).
    assert.notEqual(res.status, 401);
    assert.equal(res.status, 400);
  });
});

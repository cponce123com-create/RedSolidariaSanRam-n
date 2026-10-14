// Barrido del gate de administración (SEC-08 del Prompt Maestro V7).
//
// El diseño del API es un ÚNICO punto de control: `router.use("/admin",
// requireAdmin, adminActionLimiter)` en `routes/index.ts`, montado ANTES de
// todos los routers. Esta prueba monta el router REAL y comprueba que ninguna
// ruta /admin/* responde sin sesión. Si alguien montara un router antes del
// gate, o añadiera una ruta administrativa en un router público, el barrido lo
// detecta: es la garantía de que "no se puede ejecutar nada administrativo
// tocando solo el frontend".
import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";

process.env.DATABASE_URL ??= "postgres://localhost:5432/nonexistent";

const { default: apiRouter } = await import("./dist/routes/index.mjs");

// Rutas administrativas de todos los routers (una por recurso). No hace falta
// que el verbo exista: el gate protege TODO el prefijo /admin.
const ADMIN_GET_PATHS = [
  "/api/admin/dashboard",
  "/api/admin/donations",
  "/api/admin/donations/duplicates",
  "/api/admin/donors",
  "/api/admin/campaigns",
  "/api/admin/campaigns/1/expenses",
  "/api/admin/campaigns/1/budgets",
  "/api/admin/campaigns/1/leftovers",
  "/api/admin/campaigns/1/movements",
  "/api/admin/volunteers",
  "/api/admin/volunteer-teams",
  "/api/admin/allies",
  "/api/admin/faq",
  "/api/admin/pets",
  "/api/admin/community-reports",
  "/api/admin/reports",
  "/api/admin/supervisor/observations",
  "/api/admin/audit-logs",
  "/api/admin/users",
  "/api/admin/settings",
  "/api/admin/ledger/audit",
  "/api/admin/stats",
];

const ADMIN_WRITE_PATHS = [
  ["POST", "/api/admin/campaigns"],
  ["PUT", "/api/admin/settings"],
  ["PATCH", "/api/admin/campaigns/1"],
  ["DELETE", "/api/admin/campaigns/1"],
  ["POST", "/api/admin/users"],
  ["POST", "/api/admin/uploads"],
];

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api", apiRouter);
  app.use((err, _req, res, _next) => {
    res.status(500).json({ error: "test_server_error" });
  });
  return app;
}

async function withServer(fn) {
  const server = buildApp().listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const { port } = server.address();
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("ninguna ruta /admin/* responde sin sesión (401)", async () => {
  await withServer(async (base) => {
    for (const path of ADMIN_GET_PATHS) {
      const res = await fetch(`${base}${path}`);
      assert.equal(res.status, 401, `${path} debería exigir sesión (devolvió ${res.status})`);
      const body = await res.json();
      assert.equal(body.error, "unauthorized");
    }
  });
});

test("ninguna escritura administrativa responde sin sesión (401)", async () => {
  await withServer(async (base) => {
    for (const [method, path] of ADMIN_WRITE_PATHS) {
      const res = await fetch(`${base}${path}`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: method === "DELETE" ? undefined : JSON.stringify({}),
      });
      assert.equal(res.status, 401, `${method} ${path} debería exigir sesión (devolvió ${res.status})`);
    }
  });
});

test("las rutas públicas NO están bloqueadas por el gate", async () => {
  await withServer(async (base) => {
    for (const path of ["/api/health", "/api/campaigns", "/api/settings", "/api/stats"]) {
      const res = await fetch(`${base}${path}`);
      assert.notEqual(res.status, 401, `${path} es público y no debe exigir sesión`);
    }
  });
});

test("el login de administración es accesible sin sesión (no lo tapa el gate)", async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/api/admin/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "", password: "" }),
    });
    // Lo que importa es que la petición llegue al router de login y no al gate
    // global: la respuesta del gate es { error: "unauthorized" } con 401.
    const body = await res.json().catch(() => ({}));
    assert.notEqual(
      body.error,
      "unauthorized",
      "el gate global no debe interceptar /admin/login",
    );
  });
});

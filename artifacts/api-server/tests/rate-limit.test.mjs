import { test } from "node:test";
import assert from "node:assert/strict";

// Regresión: si un keyGenerator volviera a usar req.ip sin ipKeyGenerator,
// express-rate-limit v8 lanza ERR_ERL_KEY_GEN_IPV6 al importar el módulo.
test("rate-limit: los limiters cargan sin lanzar ValidationError de IPv6", async () => {
  const mod = await import("./dist/middleware/rate-limit.mjs");
  const limiters = [
    "apiLimiter",
    "loginLimiter",
    "adminActionLimiter",
    "contactLimiter",
    "volunteerLimiter",
    "reportLimiter",
    "donationLimiter",
    "adoptionLimiter",
    "testimonialLimiter",
  ];
  for (const name of limiters) {
    assert.equal(typeof mod[name], "function", `${name} debe ser un middleware`);
  }
});

test("rate-limit: el presupuesto administrativo se diferencia por rol", async () => {
  const mod = await import("./dist/middleware/rate-limit.mjs");
  assert.equal(mod.adminActionLimitForRole("superadmin"), 100);
  assert.equal(mod.adminActionLimitForRole("administrador"), 30);
  assert.equal(mod.adminActionLimitForRole("moderador"), 30);
  assert.equal(mod.adminActionLimitForRole(undefined), 20);
});

test("rate-limit: adminActionLimiter bloquea con 429 tras el presupuesto mínimo sin sesión", async () => {
  const express = (await import("express")).default;
  const mod = await import("./dist/middleware/rate-limit.mjs?adminrl=" + Date.now());

  const app = express();
  app.use("/api/admin", mod.adminActionLimiter);
  app.get("/api/admin/x", (_req, res) => res.json({ ok: true }));

  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const { port } = server.address();
  try {
    const base = `http://127.0.0.1:${port}`;
    const statuses = [];
    for (let i = 0; i < 22; i++) {
      const res = await fetch(`${base}/api/admin/x`);
      statuses.push(res.status);
    }
    // Sin sesión el presupuesto es 20; la petición 21 debe ser 429.
    assert.equal(statuses.slice(0, 20).every((s) => s === 200), true);
    assert.equal(statuses[20], 429);
    assert.equal(statuses[21], 429);
  } finally {
    server.close();
  }
});

// ── Limiters aplicados a rutas públicas (anti-spam) ──────────────────────────

// Cada test importa el bundle de la ruta con un query único: los limiters
// quedan inline en el bundle y así el contador de hits no se arrastra entre
// tests del mismo proceso.
async function freshRouter(routeFile, tag) {
  const mod = await import(`./dist/routes/${routeFile}.mjs?${tag}=${Date.now()}-${Math.random()}`);
  return mod.default;
}

async function countPostStatuses(base, path, count) {
  const statuses = [];
  for (let i = 0; i < count; i++) {
    const res = await fetch(`${base}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    statuses.push(res.status);
  }
  return statuses;
}

function runLimiterCase(router, path, count) {
  return async () => {
    const express = (await import("express")).default;
    const app = express();
    app.use(express.json());
    app.use("/api", router);
    // Sin DB en tests: el error del handler no debe tumbar el test, solo suma
    // al presupuesto del limiter (skipSuccessfulRequests: false → cuenta todo).
    app.use((err, _req, res, _next) => res.status(500).json({ error: "test_server_error" }));

    const server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    const { port } = server.address();
    try {
      const base = `http://127.0.0.1:${port}`;
      const statuses = await countPostStatuses(base, path, count);
      assert.equal(statuses[count - 1], 429);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  };
}

test("reportLimiter: POST /api/reports bloquea con 429 tras 10 reportes", runLimiterCase(
  await freshRouter("community-reports", "reportLimiter"),
  "/api/reports",
  11,
));

test("adoptionLimiter: POST /api/pets/submit bloquea con 429 tras 5 solicitudes", runLimiterCase(
  await freshRouter("pets", "adoptionLimiterSubmit"),
  "/api/pets/submit",
  6,
));

test("adoptionLimiter: POST /api/pets/:id/adopt bloquea con 429 tras 5 solicitudes", runLimiterCase(
  await freshRouter("pets", "adoptionLimiterAdopt"),
  "/api/pets/1/adopt",
  6,
));

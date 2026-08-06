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

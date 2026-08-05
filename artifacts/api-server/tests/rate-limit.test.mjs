import { test } from "node:test";
import assert from "node:assert/strict";

// Regresión: si un keyGenerator volviera a usar req.ip sin ipKeyGenerator,
// express-rate-limit v8 lanza ERR_ERL_KEY_GEN_IPV6 al importar el módulo.
test("rate-limit: los limiters cargan sin lanzar ValidationError de IPv6", async () => {
  const mod = await import("./dist/rate-limit.mjs");
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

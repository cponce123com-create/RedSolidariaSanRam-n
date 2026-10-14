import { test } from "node:test";
import assert from "node:assert/strict";

// Módulo puro: no importa la DB, se puede cargar directamente.
const {
  isProductionEnv,
  resolveCookieSecure,
  resolveCorsOrigin,
  siteOrigin,
  validateSecurityConfig,
} = await import("./dist/lib/security-config.mjs");

// ─── SEC-01: cookie Secure ───────────────────────────────────────────────────

test("resolveCookieSecure: producción marca la cookie como Secure", () => {
  assert.equal(resolveCookieSecure({ NODE_ENV: "production" }), true);
});

test("resolveCookieSecure: HTTPS en SITE_URL marca Secure aunque falte NODE_ENV", () => {
  assert.equal(
    resolveCookieSecure({ NODE_ENV: "staging", SITE_URL: "https://redsolidariasanramon.org" }),
    true,
  );
});

test("resolveCookieSecure: desarrollo por HTTP NO marca Secure", () => {
  assert.equal(resolveCookieSecure({ NODE_ENV: "development" }), false);
  assert.equal(
    resolveCookieSecure({ NODE_ENV: "development", SITE_URL: "http://localhost:5173" }),
    false,
  );
});

// ─── SEC-05: CORS ────────────────────────────────────────────────────────────

test("resolveCorsOrigin: en producción sin CORS_ORIGIN usa el origen del sitio", () => {
  assert.equal(
    resolveCorsOrigin({ NODE_ENV: "production", SITE_URL: "https://redsolidariasanramon.org" }),
    "https://redsolidariasanramon.org",
  );
});

test("resolveCorsOrigin: un CORS_ORIGIN explícito gana", () => {
  assert.equal(
    resolveCorsOrigin({ NODE_ENV: "production", CORS_ORIGIN: "https://panel.example.org" }),
    "https://panel.example.org",
  );
});

test("resolveCorsOrigin: en desarrollo refleja el origen de la petición", () => {
  assert.equal(resolveCorsOrigin({ NODE_ENV: "development" }), true);
});

test("siteOrigin: extrae el origen y descarta el path", () => {
  assert.equal(siteOrigin("https://redsolidariasanramon.org/campanas/x"), "https://redsolidariasanramon.org");
  assert.equal(siteOrigin("no-es-url"), null);
  assert.equal(siteOrigin(undefined), null);
});

// ─── validateSecurityConfig ──────────────────────────────────────────────────

test("validateSecurityConfig: comodín CORS en producción es un error", () => {
  const errors = validateSecurityConfig({ NODE_ENV: "production", CORS_ORIGIN: "*" });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /CORS_ORIGIN/);
});

test("validateSecurityConfig: SITE_URL no-HTTPS en producción es un error", () => {
  const errors = validateSecurityConfig({ NODE_ENV: "production", SITE_URL: "http://redsolidariasanramon.org" });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /HTTPS/);
});

test("validateSecurityConfig: producción bien configurada no tiene errores", () => {
  assert.deepEqual(
    validateSecurityConfig({
      NODE_ENV: "production",
      SITE_URL: "https://redsolidariasanramon.org",
      CORS_ORIGIN: "https://redsolidariasanramon.org",
    }),
    [],
  );
});

test("validateSecurityConfig: en desarrollo no hay errores aunque haya comodín", () => {
  assert.deepEqual(
    validateSecurityConfig({ NODE_ENV: "development", CORS_ORIGIN: "*", SITE_URL: "http://localhost" }),
    [],
  );
});

test("isProductionEnv: solo 'production' cuenta", () => {
  assert.equal(isProductionEnv({ NODE_ENV: "production" }), true);
  assert.equal(isProductionEnv({ NODE_ENV: "staging" }), false);
  assert.equal(isProductionEnv({}), false);
});

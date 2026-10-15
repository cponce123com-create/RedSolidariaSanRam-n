// Defensa CSRF por ORIGEN (V14-1.4) — lógica pura + middleware.
//
// Estado previo ya correcto (cookie httpOnly + secure + sameSite=lax, CORS sin comodín
// en producción, sin secretos en logs): esto es DEFENSA EN PROFUNDIDAD, no un parche de
// una brecha abierta. Las pruebas fijan que no rompe el panel ni el propio ensayo.
import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";

process.env.DATABASE_URL ??= "postgres://localhost:5432/nonexistent";

const { checkRequestOrigin, createCsrfOriginGuard, STATE_CHANGING_METHODS } = await import(
  "./dist/lib/csrf-origin.mjs"
);

const ALLOWED = ["https://redsolidariasanram-n.onrender.com"];
const check = (overrides) =>
  checkRequestOrigin({
    method: "POST",
    origin: null,
    host: "redsolidariasanram-n.onrender.com",
    secFetchSite: null,
    allowedOrigins: ALLOWED,
    ...overrides,
  });

// ─── Lecturas: nunca se restringen ───────────────────────────────────────────

test("las lecturas (GET/HEAD/OPTIONS) pasan siempre, vengan de donde vengan", () => {
  for (const method of ["GET", "HEAD", "OPTIONS"]) {
    assert.equal(
      check({ method, origin: "https://sitio-malicioso.example" }).ok,
      true,
      method,
    );
  }
  assert.deepEqual([...STATE_CHANGING_METHODS], ["POST", "PUT", "PATCH", "DELETE"]);
});

// ─── Escrituras ──────────────────────────────────────────────────────────────

test("Sec-Fetch-Site: cross-site se rechaza en una escritura", () => {
  const verdict = check({ secFetchSite: "cross-site", origin: "https://sitio-malicioso.example" });
  assert.equal(verdict.ok, false);
  assert.equal(verdict.reason, "cross_site");
});

test("un origen ajeno se rechaza", () => {
  const verdict = check({ origin: "https://sitio-malicioso.example" });
  assert.equal(verdict.ok, false);
  assert.equal(verdict.reason, "origin_not_allowed");
});

test("el mismo host que la petición se acepta (el panel hablando consigo mismo)", () => {
  // Incluso si el dominio público no está en la lista de CORS: así no se rompen los
  // despliegues que entran por la URL de Render.
  assert.equal(check({ origin: "https://redsolidariasanram-n.onrender.com" }).ok, true);
  assert.equal(check({ origin: "http://redsolidariasanram-n.onrender.com" }).ok, true);
});

test("un origen de la lista de CORS se acepta (aunque el host no coincida)", () => {
  assert.equal(
    check({ origin: "https://redsolidariasanram-n.onrender.com", host: "interno:10000" }).ok,
    true,
  );
});

test("sin cabecera Origin se acepta: no es un navegador, no hay CSRF", () => {
  // curl, el ensayo E2E y las integraciones no envían Origin. Sin navegador no hay
  // CSRF posible, y sin cookie robada no hay sesión que robar.
  assert.equal(check({ origin: null }).ok, true);
  assert.equal(check({ origin: null, secFetchSite: "same-origin" }).ok, true);
});

test("un Origin mal formado no cuela como mismo host", () => {
  for (const origin of ["no-es-una-url", "https://", "  "]) {
    const verdict = check({ origin });
    assert.equal(verdict.ok, false, JSON.stringify(origin));
    assert.equal(verdict.reason, "origin_not_allowed");
  }
});

test("la comparación ignora la barra final y las mayúsculas", () => {
  assert.equal(check({ origin: "https://REDSOLIDARIASANRAM-N.ONRENDER.COM/" }).ok, true);
});

// ─── Middleware sobre un servidor real ───────────────────────────────────────

async function withServer(fn) {
  const app = express();
  app.use(express.json());
  app.use("/api", createCsrfOriginGuard(ALLOWED));
  app.use("/api", (req, res) => res.json({ reached: true, method: req.method }));
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    await fn(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("el middleware deja pasar una lectura con origen ajeno", async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/api/x`, { headers: { Origin: "https://sitio-malicioso.example" } });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).reached, true);
  });
});

test("el middleware bloquea una escritura cross-site con 403 y no llega al handler", async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/api/x`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "https://sitio-malicioso.example" },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.error, "csrf_origin_rejected");
    assert.equal(body.code, "origin_not_allowed");
  });
});

test("el middleware deja pasar una escritura del propio panel", async () => {
  await withServer(async (base) => {
    // El navegador envía como Origin el origen COMPLETO (esquema, host y puerto), que
    // coincide con el Host de la petición: es el caso real del panel.
    const res = await fetch(`${base}/api/x`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: base },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).reached, true);
  });
});

test("el middleware no molesta al ensayo (fetch sin Origin)", async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/api/x`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
    });
    assert.equal(res.status, 200);
  });
});

import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import compression from "compression";

// Configuración de rendimiento del API:
// - publicApiLimiter exime sesiones admin del límite global por IP.
// - publicApiCache añade Cache-Control solo a GETs públicos no sensibles.
// - compression({threshold:256}) comprime respuestas JSON medianas/grandes.

const { publicApiLimiter } = await import(
  "./dist/middleware/rate-limit.mjs?plimiter=" + Date.now()
);
const { publicApiCache } = await import("./dist/middleware/cache-control.mjs");

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

// ─── publicApiLimiter ────────────────────────────────────────────────────────

test("publicApiLimiter: sesión admin exenta del límite global por IP", async () => {
  const app = express();
  app.use((req, _res, next) => {
    if (req.headers["x-test-admin"] === "1") {
      req.session = {
        adminUser: { id: 1, username: "admin", role: "superadmin" },
      };
    }
    next();
  });
  app.use("/api", publicApiLimiter);
  app.get("/api/x", (_req, res) => res.json({ ok: true }));

  await withServer(app, async (base) => {
    const statuses = [];
    for (let i = 0; i < 105; i++) {
      const res = await fetch(`${base}/api/x`, {
        headers: { "x-test-admin": "1" },
      });
      statuses.push(res.status);
    }
    // El presupuesto anónimo es 100/15min; una sesión admin no debe agotarse nunca.
    assert.equal(
      statuses.every((s) => s === 200),
      true,
      "admin no debe recibir 429",
    );
  });
});

test("publicApiLimiter: tráfico anónimo sí se limita a 100 req/15min", async () => {
  const mod = await import(
    "./dist/middleware/rate-limit.mjs?plimiter-anon=" + Date.now()
  );
  const app = express();
  app.use("/api", mod.publicApiLimiter);
  app.get("/api/x", (_req, res) => res.json({ ok: true }));

  await withServer(app, async (base) => {
    let last = 0;
    for (let i = 0; i < 102; i++) {
      const res = await fetch(`${base}/api/x`);
      last = res.status;
    }
    assert.equal(last, 429, "la petición 102 sin sesión debe ser 429");
  });
});

// ─── publicApiCache ──────────────────────────────────────────────────────────

function buildCacheApp() {
  const app = express();
  app.use("/api", publicApiCache);
  app.get("/api/campaigns", (_req, res) => res.json([]));
  app.get("/api/campaigns/5/donors", (_req, res) => res.json([]));
  app.get("/api/campaigns/3/donations", (_req, res) => res.json([]));
  app.get("/api/donations/stats", (_req, res) => res.json({}));
  app.get("/api/donations", (_req, res) => res.json([]));
  app.get("/api/donations/7/proofs", (_req, res) => res.json([]));
  app.get("/api/admin/me", (_req, res) => res.json({}));
  app.get("/api/healthz", (_req, res) => res.json({ status: "ok" }));
  app.get("/api/contact/messages", (_req, res) => res.json([]));
  app.post("/api/campaigns", (_req, res) => res.status(201).json({}));
  return app;
}

async function cacheHeader(base, path, method = "GET") {
  const res = await fetch(`${base}${path}`, { method });
  return res.headers.get("cache-control");
}

test("publicApiCache: GETs públicos reciben Cache-Control", async () => {
  const app = buildCacheApp();
  await withServer(app, async (base) => {
    assert.equal(
      await cacheHeader(base, "/api/campaigns"),
      "public, max-age=60",
    );
    assert.equal(
      await cacheHeader(base, "/api/campaigns/5/donors"),
      "public, max-age=60",
    );
    assert.equal(
      await cacheHeader(base, "/api/donations/stats"),
      "public, max-age=60",
    );
  });
});

test("publicApiCache: GETs sensibles/admin y POSTs NO se cachean", async () => {
  const app = buildCacheApp();
  await withServer(app, async (base) => {
    assert.equal(await cacheHeader(base, "/api/donations"), null);
    assert.equal(await cacheHeader(base, "/api/donations/7/proofs"), null);
    assert.equal(await cacheHeader(base, "/api/campaigns/3/donations"), null);
    assert.equal(await cacheHeader(base, "/api/admin/me"), null);
    assert.equal(await cacheHeader(base, "/api/healthz"), null);
    assert.equal(await cacheHeader(base, "/api/contact/messages"), null);
    assert.equal(await cacheHeader(base, "/api/campaigns", "POST"), null);
  });
});

// ─── compression ─────────────────────────────────────────────────────────────

test("compression: respuestas JSON >= 256B viajan gzip", async () => {
  const app = express();
  app.use(compression({ threshold: 256 }));
  app.get("/big", (_req, res) =>
    res.json({
      data: "x".repeat(2000),
      list: Array.from({ length: 20 }, (_, i) => ({ i, v: "valor " + i })),
    }),
  );
  app.get("/tiny", (_req, res) => res.json({ ok: true }));

  await withServer(app, async (base) => {
    const big = await fetch(`${base}/big`, {
      headers: { "Accept-Encoding": "gzip" },
    });
    assert.equal(big.headers.get("content-encoding"), "gzip");

    const tiny = await fetch(`${base}/tiny`, {
      headers: { "Accept-Encoding": "gzip" },
    });
    // Payload pequeño (< umbral 256B): no se comprime para ahorrar CPU.
    assert.equal(tiny.headers.get("content-encoding"), null);
  });
});

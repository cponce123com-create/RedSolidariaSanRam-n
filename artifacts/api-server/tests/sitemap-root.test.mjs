import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";

// SITE_URL se captura al cargar el módulo; fijamos uno conocido para poder
// verificar el robots.txt. DATABASE_URL: el pool de pg no se conecta hasta la
// primera query, así que basta un valor dummy.
process.env.SITE_URL ??= "https://redsolidariasanramon.org";
process.env.DATABASE_URL ??= "postgres://localhost:5432/nonexistent";

const { default: sitemapRouter } = await import("./dist/routes/sitemap.mjs");

// App mínima que monta el router de sitemap en la RAÍZ, igual que hará app.ts
// (fuera del prefijo /api).
function buildApp() {
  const app = express();
  app.use(sitemapRouter);
  // Error handler mínimo: sin DB real, /sitemap.xml falla en la query y cae
  // aquí (500) — lo importante es que nunca responde 404 (no montado).
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

test("GET /robots.txt responde en la raíz con el Sitemap en el root", async () => {
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/robots.txt`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type") || "", /text\/plain/);
    const body = await res.text();
    assert.match(body, /Disallow: \/admin\//);
    assert.match(body, /Sitemap: https:\/\/redsolidariasanramon\.org\/sitemap\.xml/);
  });
});

test("GET /sitemap.xml responde en la raíz (nunca 404)", async () => {
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/sitemap.xml`);
    // Montado en la raíz: sin DB la query falla (500) o responde 200 con DB
    // real, pero NUNCA 404 (que indicaría que no está montado en el root).
    assert.notEqual(res.status, 404);
  });
});

import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";

process.env.DATABASE_URL ??= "postgres://localhost:5432/nonexistent";

const { default: donationsRouter } = await import("./dist/routes/donations.mjs");

/**
 * Autorización de los consentimientos del donante (Fase 4 · V7.1). Son datos
 * personales: solo administrador/superadmin, nunca moderadores ni anónimos.
 */
function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.log = { error: () => {}, warn: () => {} };
    const role = req.headers["x-test-role"];
    if (typeof role === "string" && role) {
      req.session = { adminUser: { id: 1, username: "admin", role } };
    }
    next();
  });
  app.use("/api", donationsRouter);
  app.use((_err, _req, res, _next) => {
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

const post = (base, path, body, role) =>
  fetch(`${base}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(role ? { "x-test-role": role } : {}),
    },
    body: JSON.stringify(body),
  });

test("GET /donations/:id/consents sin sesión → 401", async () => {
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/donations/1/consents`);
    assert.equal(res.status, 401);
  });
});

test("GET /donations/:id/consents con moderador → 403 (datos personales)", async () => {
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/donations/1/consents`, {
      headers: { "x-test-role": "moderador" },
    });
    assert.equal(res.status, 403);
  });
});

test("POST /donations/:id/consents sin sesión → 401", async () => {
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await post(base, "/api/donations/1/consents", {
      scope: "public_name",
      granted: false,
      reason: "El donante pidió no aparecer",
    });
    assert.equal(res.status, 401);
  });
});

test("POST /donations/:id/consents con moderador → 403", async () => {
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await post(
      base,
      "/api/donations/1/consents",
      { scope: "public_name", granted: false, reason: "El donante pidió no aparecer" },
      "moderador",
    );
    assert.equal(res.status, 403);
  });
});

test("POST con alcance inválido → 400 antes de tocar la base", async () => {
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await post(
      base,
      "/api/donations/1/consents",
      { scope: "public_amount", granted: true },
      "administrador",
    );
    assert.equal(res.status, 400);
  });
});

test("POST revocando sin motivo → 400 (la revocación debe ser trazable)", async () => {
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await post(
      base,
      "/api/donations/1/consents",
      { scope: "public_name", granted: false },
      "administrador",
    );
    assert.equal(res.status, 400);
  });
});

test("POST con administrador y decisión válida → pasa el gate (llega a DB → 500)", async () => {
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await post(
      base,
      "/api/donations/1/consents",
      { scope: "public_name", granted: false, reason: "El donante pidió no aparecer" },
      "administrador",
    );
    assert.notEqual(res.status, 401);
    assert.notEqual(res.status, 403);
    assert.notEqual(res.status, 400);
    assert.equal(res.status, 500);
  });
});

test("id inválido → 400", async () => {
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/donations/abc/consents`, {
      headers: { "x-test-role": "administrador" },
    });
    assert.equal(res.status, 400);
  });
});

import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";

process.env.DATABASE_URL ??= "postgres://localhost:5432/nonexistent";

const { default: donationsRouter } = await import("./dist/routes/donations.mjs");

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    // pino-http provee req.log en producción; aquí usamos un stub para que el
    // catch de los handlers responda 400/500 en vez de crashear.
    req.log = { error: () => {} };
    if (req.headers["x-test-admin"] === "1") {
      req.session = { adminUser: { id: 1, username: "admin", role: "superadmin" } };
    }
    next();
  });
  app.use("/api", donationsRouter);
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

test("GET /api/donations sin sesión → 401 (datos personales protegidos)", async () => {
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/donations`);
    assert.equal(res.status, 401);
  });
});

test("GET /api/donations/:id sin sesión → 401", async () => {
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/donations/1`);
    assert.equal(res.status, 401);
  });
});

test("GET /api/campaigns/1/donations sin sesión → 401", async () => {
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/campaigns/1/donations`);
    assert.equal(res.status, 401);
  });
});

test("PUT /api/donations/1 con status inválido y sesión → 400 (validación antes de DB)", async () => {
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/donations/1`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", "x-test-admin": "1" },
      body: JSON.stringify({ status: "hacked" }),
    });
    assert.equal(res.status, 400);
  });
});

test("POST /api/donations con tipo inválido → 400 (schema Zod antes de DB)", async () => {
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/donations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: "no-es-un-numero" }),
    });
    assert.equal(res.status, 400);
  });
});

// ── Validación de negocio server-side (antes de tocar la DB) ────────────────

const VALID_BODY = {
  firstName: "María",
  lastName: "Quispe",
  email: "maria@example.com",
  amount: 50,
  paymentMethod: "yape",
};

async function postDonation(base, body) {
  const res = await fetch(`${base}/api/donations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res;
}

test("POST /api/donations con monto negativo → 400 (el frontend no es la frontera)", async () => {
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await postDonation(base, { ...VALID_BODY, amount: -500 });
    assert.equal(res.status, 400);
  });
});

test("POST /api/donations con monto cero → 400", async () => {
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await postDonation(base, { ...VALID_BODY, amount: 0 });
    assert.equal(res.status, 400);
  });
});

test("POST /api/donations con monto de más de 2 decimales → 400 (no redondeo silencioso)", async () => {
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await postDonation(base, { ...VALID_BODY, amount: 50.123 });
    assert.equal(res.status, 400);
  });
});

test("POST /api/donations con email inválido → 400", async () => {
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await postDonation(base, { ...VALID_BODY, email: "no-es-email" });
    assert.equal(res.status, 400);
  });
});

test("POST /api/donations con método de pago inválido → 400", async () => {
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await postDonation(base, { ...VALID_BODY, paymentMethod: "yapeee" });
    assert.equal(res.status, 400);
  });
});

test("POST /api/donations con comprobante no-https → 400 (bloquea vectores de URL arbitraria)", async () => {
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await postDonation(base, {
      ...VALID_BODY,
      proofImageUrl: "http://evil.com/fake-receipt.jpg",
      proofPublicId: "x",
    });
    assert.equal(res.status, 400);
  });
});

test("POST /api/donations con comprobante de host no-Cloudinary → 400 (flujo del donante)", async () => {
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await postDonation(base, {
      ...VALID_BODY,
      proofImageUrl: "https://example.com/receipt.jpg",
      proofPublicId: "x",
    });
    assert.equal(res.status, 400);
  });
});

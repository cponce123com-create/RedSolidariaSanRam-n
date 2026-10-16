import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";

// La ruta importa @workspace/db (exige DATABASE_URL al cargar; el pool no se
// conecta hasta la primera query → un dummy basta). Los casos cubiertos NO tocan
// la DB: autorización (403) y validación (400), que ocurren ANTES de leer la fila.
process.env.DATABASE_URL ??= "postgres://localhost:5432/nonexistent";

const { default: identityRouter } = await import("./dist/routes/institutional-identity.mjs");

/**
 * La identidad institucional solo la administra el SUPERADMIN (requireRole).
 * Se monta el router real con una sesión simulada por cabecera, igual que en
 * settings-upsert.test.mjs, para cubrir los caminos que no tocan la base:
 *   · sin sesión / rol insuficiente → 403,
 *   · contenido inválido o descarte vacío → 400.
 */
function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.log = { error() {}, warn() {}, info() {}, debug() {} };
    const role = req.headers["x-test-role"];
    if (typeof role === "string" && role) {
      req.session = { adminUser: { id: 1, username: "admin", role } };
    }
    next();
  });
  app.use("/api", identityRouter);
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

function request(base, path, { method = "GET", body, role } = {}) {
  return fetch(`${base}/api${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(role ? { "x-test-role": role } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

test("GET /admin/institutional-identity sin sesión → 403", async () => {
  await withServer(buildApp(), async (base) => {
    const res = await request(base, "/admin/institutional-identity");
    assert.equal(res.status, 403);
  });
});

test("GET /admin/institutional-identity con rol insuficiente → 403", async () => {
  await withServer(buildApp(), async (base) => {
    const res = await request(base, "/admin/institutional-identity", { role: "moderador" });
    assert.equal(res.status, 403);
  });
});

test("PUT /admin/institutional-identity sin sesión → 403", async () => {
  await withServer(buildApp(), async (base) => {
    const res = await request(base, "/admin/institutional-identity", {
      method: "PUT",
      body: { content: {} },
    });
    assert.equal(res.status, 403);
  });
});

test("PUT /admin/institutional-identity con CTA incompleto → 400 (sin tocar la DB)", async () => {
  await withServer(buildApp(), async (base) => {
    const res = await request(base, "/admin/institutional-identity", {
      method: "PUT",
      role: "superadmin",
      body: { content: { hero: { ctaLabel: "Donar", ctaHref: "" } } },
    });
    assert.equal(res.status, 400);
    const payload = await res.json();
    assert.equal(payload.error, "validation_error");
  });
});

test("POST /admin/institutional-identity/publish sin sesión → 403", async () => {
  await withServer(buildApp(), async (base) => {
    const res = await request(base, "/admin/institutional-identity/publish", {
      method: "POST",
      body: { content: {} },
    });
    assert.equal(res.status, 403);
  });
});

test("POST /admin/institutional-identity/discard-assets sin publicIds → 400", async () => {
  await withServer(buildApp(), async (base) => {
    const res = await request(base, "/admin/institutional-identity/discard-assets", {
      method: "POST",
      role: "superadmin",
      body: { publicIds: [] },
    });
    assert.equal(res.status, 400);
  });
});

test("POST /admin/institutional-identity/discard-assets sin sesión → 403", async () => {
  await withServer(buildApp(), async (base) => {
    const res = await request(base, "/admin/institutional-identity/discard-assets", {
      method: "POST",
      body: { publicIds: ["institutional-identity/logo/x"] },
    });
    assert.equal(res.status, 403);
  });
});

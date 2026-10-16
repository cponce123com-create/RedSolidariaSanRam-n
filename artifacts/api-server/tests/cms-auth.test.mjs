import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";

// La ruta importa @workspace/db (exige DATABASE_URL al cargar; el pool no se
// conecta hasta la primera query → un dummy basta). Los casos cubiertos NO tocan
// la DB: autorización (403) y validación (400/404), que ocurren ANTES de leer fila.
process.env.DATABASE_URL ??= "postgres://localhost:5432/nonexistent";

const { default: cmsRouter } = await import("./dist/routes/cms.mjs");

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
  app.use("/api", cmsRouter);
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

test("GET /cms/pages/:slug con slug desconocido → 404 (sin tocar la DB)", async () => {
  await withServer(buildApp(), async (base) => {
    const res = await request(base, "/cms/pages/no-existe");
    assert.equal(res.status, 404);
  });
});

test("GET /admin/cms/pages sin sesión → 403", async () => {
  await withServer(buildApp(), async (base) => {
    const res = await request(base, "/admin/cms/pages");
    assert.equal(res.status, 403);
  });
});

test("GET /admin/cms/pages con rol insuficiente → 403", async () => {
  await withServer(buildApp(), async (base) => {
    const res = await request(base, "/admin/cms/pages", { role: "moderador" });
    assert.equal(res.status, 403);
  });
});

test("GET /admin/cms/pages/:slug con slug desconocido → 404", async () => {
  await withServer(buildApp(), async (base) => {
    const res = await request(base, "/admin/cms/pages/no-existe", { role: "superadmin" });
    assert.equal(res.status, 404);
  });
});

test("PUT /admin/cms/pages/:slug sin sesión → 403", async () => {
  await withServer(buildApp(), async (base) => {
    const res = await request(base, "/admin/cms/pages/inicio", {
      method: "PUT",
      body: { content: {} },
    });
    assert.equal(res.status, 403);
  });
});

test("PUT /admin/cms/pages/:slug con botón sin enlace → 400 (sin tocar la DB)", async () => {
  await withServer(buildApp(), async (base) => {
    const res = await request(base, "/admin/cms/pages/inicio", {
      method: "PUT",
      role: "superadmin",
      body: {
        content: { blocks: [{ type: "hero", fields: { ctaLabel: { es: "Donar" }, ctaHref: { es: "" } } }] },
      },
    });
    assert.equal(res.status, 400);
    const payload = await res.json();
    assert.equal(payload.error, "validation_error");
  });
});

test("POST /admin/cms/pages/:slug/schedule con fecha pasada → 400 (sin tocar la DB)", async () => {
  await withServer(buildApp(), async (base) => {
    const res = await request(base, "/admin/cms/pages/inicio/schedule", {
      method: "POST",
      role: "superadmin",
      body: { scheduledAt: "2000-01-01T00:00:00.000Z", content: {} },
    });
    assert.equal(res.status, 400);
  });
});

test("POST /admin/cms/assets/discard con página inválida → 400", async () => {
  await withServer(buildApp(), async (base) => {
    const res = await request(base, "/admin/cms/assets/discard", {
      method: "POST",
      role: "superadmin",
      body: { page: "no-existe", publicIds: ["cms/inicio/x"] },
    });
    assert.equal(res.status, 400);
  });
});

test("POST /admin/cms/assets/discard sin publicIds → 400", async () => {
  await withServer(buildApp(), async (base) => {
    const res = await request(base, "/admin/cms/assets/discard", {
      method: "POST",
      role: "superadmin",
      body: { page: "inicio", publicIds: [] },
    });
    assert.equal(res.status, 400);
  });
});

test("POST /admin/cms/assets/discard sin sesión → 403", async () => {
  await withServer(buildApp(), async (base) => {
    const res = await request(base, "/admin/cms/assets/discard", {
      method: "POST",
      body: { page: "inicio", publicIds: ["cms/inicio/x"] },
    });
    assert.equal(res.status, 403);
  });
});

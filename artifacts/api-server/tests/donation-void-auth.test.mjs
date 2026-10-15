// Anulación contable de donaciones (V7.2.2) — autorización y validación HTTP.
//
// Regresión cubierta: anular cambia cifras publicadas, así que es EXCLUSIVO del
// superadmin y exige reautenticación, confirmación explícita y motivo. Ninguna
// petición incompleta debe llegar a la base de datos.
import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";

process.env.DATABASE_URL ??= "postgres://localhost:5432/nonexistent";

const { default: donationsRouter } = await import("./dist/routes/donations.mjs");

let adminSeq = 0;

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.log = { error: () => {}, warn: () => {}, info: () => {}, debug: () => {} };
    const role = req.headers["x-test-role"];
    if (typeof role === "string" && role.length > 0) {
      req.session = {
        adminUser: {
          id: Number(req.headers["x-test-admin-id"] ?? ++adminSeq),
          username: "tester",
          name: "Tester",
          role,
        },
      };
    }
    next();
  });
  app.use("/api", donationsRouter);
  app.use((_err, _req, res, _next) => res.status(500).json({ error: "test_server_error" }));
  return app;
}

async function withServer(fn) {
  const app = buildApp();
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const { port } = server.address();
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function call(base, path, { role, method = "POST", body } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (role) {
    headers["x-test-role"] = role;
    // Cada petición usa un admin distinto: el presupuesto de reautenticación es
    // por usuario y así los casos no se contaminan entre sí.
    headers["x-test-admin-id"] = String(++adminSeq);
  }
  return fetch(`${base}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const voidBody = (overrides = {}) => ({
  confirm: true,
  reason: "campaña de demostración con datos ficticios",
  password: "s3cret!",
  ...overrides,
});

// ─── Anulación individual ────────────────────────────────────────────────────

test("anular sin sesión → 401", async () => {
  await withServer(async (base) => {
    const res = await call(base, "/api/donations/16/void", { body: voidBody() });
    assert.equal(res.status, 401);
  });
});

test("anular es EXCLUSIVO del superadmin: un administrador → 403", async () => {
  await withServer(async (base) => {
    const res = await call(base, "/api/donations/16/void", {
      role: "administrador",
      body: voidBody(),
    });
    assert.equal(res.status, 403);
  });
});

test("anular con un moderador → 403", async () => {
  await withServer(async (base) => {
    const res = await call(base, "/api/donations/16/void", {
      role: "moderador",
      body: voidBody(),
    });
    assert.equal(res.status, 403);
  });
});

test("anular con id inválido → 400", async () => {
  await withServer(async (base) => {
    const res = await call(base, "/api/donations/0/void", {
      role: "superadmin",
      body: voidBody(),
    });
    assert.equal(res.status, 400);
  });
});

test("anular sin confirmación explícita → 400", async () => {
  await withServer(async (base) => {
    const res = await call(base, "/api/donations/16/void", {
      role: "superadmin",
      body: voidBody({ confirm: undefined }),
    });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).code, "confirmation_required");
  });
});

test("anular con motivo demasiado corto → 400", async () => {
  await withServer(async (base) => {
    const res = await call(base, "/api/donations/16/void", {
      role: "superadmin",
      body: voidBody({ reason: "x" }),
    });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).code, "reason_required");
  });
});

test("anular sin contraseña de reautenticación → 400 (no toca la base)", async () => {
  await withServer(async (base) => {
    const res = await call(base, "/api/donations/16/void", {
      role: "superadmin",
      body: voidBody({ password: "" }),
    });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).code, "reauth_required");
  });
});

test("anular con petición completa de superadmin pasa el gate", async () => {
  await withServer(async (base) => {
    const res = await call(base, "/api/donations/16/void", {
      role: "superadmin",
      body: voidBody(),
    });
    // Llega a la verificación de identidad (base ficticia → 500): nunca 400/401/403.
    assert.equal(res.status, 500);
  });
});

// ─── Vista previa por campaña ────────────────────────────────────────────────

test("preview de anulación sin sesión → 401", async () => {
  await withServer(async (base) => {
    const res = await call(base, "/api/campaigns/3/donations/void/preview", {
      method: "GET",
    });
    assert.equal(res.status, 401);
  });
});

test("preview de anulación con un administrador → 403", async () => {
  await withServer(async (base) => {
    const res = await call(base, "/api/campaigns/3/donations/void/preview", {
      method: "GET",
      role: "administrador",
    });
    assert.equal(res.status, 403);
  });
});

test("preview de anulación con id inválido → 400", async () => {
  await withServer(async (base) => {
    const res = await call(base, "/api/campaigns/abc/donations/void/preview", {
      method: "GET",
      role: "superadmin",
    });
    assert.equal(res.status, 400);
  });
});

test("preview de anulación con superadmin → 500 (base ficticia)", async () => {
  await withServer(async (base) => {
    const res = await call(base, "/api/campaigns/3/donations/void/preview", {
      method: "GET",
      role: "superadmin",
    });
    assert.equal(res.status, 500);
  });
});

// ─── Anulación en bloque por campaña ─────────────────────────────────────────

test("anulación en bloque sin sesión → 401", async () => {
  await withServer(async (base) => {
    const res = await call(base, "/api/campaigns/3/donations/void", { body: voidBody() });
    assert.equal(res.status, 401);
  });
});

test("anulación en bloque con un administrador → 403", async () => {
  await withServer(async (base) => {
    const res = await call(base, "/api/campaigns/3/donations/void", {
      role: "administrador",
      body: voidBody(),
    });
    assert.equal(res.status, 403);
  });
});

test("anulación en bloque sin motivo → 400", async () => {
  await withServer(async (base) => {
    const res = await call(base, "/api/campaigns/3/donations/void", {
      role: "superadmin",
      body: voidBody({ reason: "" }),
    });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).code, "reason_required");
  });
});

test("anulación en bloque con petición completa pasa el gate", async () => {
  await withServer(async (base) => {
    const res = await call(base, "/api/campaigns/3/donations/void", {
      role: "superadmin",
      body: voidBody(),
    });
    assert.equal(res.status, 500);
  });
});

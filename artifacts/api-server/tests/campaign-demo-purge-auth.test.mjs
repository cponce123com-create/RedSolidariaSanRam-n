// Purga definitiva de campañas DEMO (V7.2) — autorización y validación HTTP.
//
// Regresión cubierta: la operación es EXCLUSIVA del superadmin y exige
// confirmación explícita, identificador escrito a mano, motivo y contraseña de
// reautenticación. Ninguna petición incompleta llega a la base de datos.
import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";

process.env.DATABASE_URL ??= "postgres://localhost:5432/nonexistent";

const { default: campaignsRouter } = await import("./dist/routes/campaigns.mjs");

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    // `req.log` es inyectado por pino-http en la app real; aquí se sustituye.
    req.log = { error: () => {}, warn: () => {}, info: () => {}, debug: () => {} };
    const role = req.headers["x-test-role"];
    if (typeof role === "string" && role.length > 0) {
      req.session = {
        adminUser: {
          id: Number(req.headers["x-test-admin-id"] ?? 1),
          username: "tester",
          name: "Tester",
          role,
        },
      };
    }
    next();
  });
  app.use("/api", campaignsRouter);
  // Manejador de errores de prueba: cualquier fallo no capturado es un 500.
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

// Cada petición que atraviesa `reauthLimiter` usa un id de admin distinto para
// que el presupuesto estrecho (5 intentos) no contamine a los demás casos.
let adminSeq = 0;
function call(base, path, { role, method = "GET", body } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (role) {
    headers["x-test-role"] = role;
    headers["x-test-admin-id"] = String(++adminSeq);
  }
  return fetch(`${base}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const purgeBody = (overrides = {}) => ({
  confirm: true,
  identifier: "7",
  reason: "datos de prueba cargados por error en la demo",
  password: "s3cret!",
  ...overrides,
});

// ─── Vista previa del análisis ───────────────────────────────────────────────

test("preview: sin sesión → 401", async () => {
  await withServer(async (base) => {
    const res = await call(base, "/api/campaigns/7/demo-purge/preview");
    assert.equal(res.status, 401);
  });
});

test("preview: un administrador normal → 403 (exclusiva del superadmin)", async () => {
  await withServer(async (base) => {
    const res = await call(base, "/api/campaigns/7/demo-purge/preview", {
      role: "administrador",
    });
    assert.equal(res.status, 403);
  });
});

test("preview: superadmin con id inválido → 400", async () => {
  await withServer(async (base) => {
    const res = await call(base, "/api/campaigns/abc/demo-purge/preview", {
      role: "superadmin",
    });
    assert.equal(res.status, 400);
  });
});

test("preview: superadmin pasa el gate y consulta la base", async () => {
  await withServer(async (base) => {
    const res = await call(base, "/api/campaigns/7/demo-purge/preview", {
      role: "superadmin",
    });
    // Con la URL de base ficticia, la consulta falla: 500 y NO un 401/403.
    assert.equal(res.status, 500);
  });
});

// ─── Declaración DEMO ────────────────────────────────────────────────────────

test("demo-mark: sin sesión → 401", async () => {
  await withServer(async (base) => {
    const res = await call(base, "/api/campaigns/7/demo-mark", {
      method: "POST",
      body: { confirm: true, reason: "campaña de demostración", password: "x" },
    });
    assert.equal(res.status, 401);
  });
});

test("demo-mark: un administrador normal → 403", async () => {
  await withServer(async (base) => {
    const res = await call(base, "/api/campaigns/7/demo-mark", {
      method: "POST",
      role: "administrador",
      body: { confirm: true, reason: "campaña de demostración", password: "x" },
    });
    assert.equal(res.status, 403);
  });
});

test("demo-mark: superadmin sin confirmación explícita → 400", async () => {
  await withServer(async (base) => {
    const res = await call(base, "/api/campaigns/7/demo-mark", {
      method: "POST",
      role: "superadmin",
      body: { reason: "campaña de demostración", password: "x" },
    });
    assert.equal(res.status, 400);
    const payload = await res.json();
    assert.equal(payload.code, "confirmation_required");
  });
});

test("demo-mark: superadmin con petición completa → 500 (base ficticia)", async () => {
  await withServer(async (base) => {
    const res = await call(base, "/api/campaigns/7/demo-mark", {
      method: "POST",
      role: "superadmin",
      body: { confirm: true, reason: "campaña de demostración", password: "x" },
    });
    assert.equal(res.status, 500);
  });
});

test("demo-mark DELETE: un administrador normal → 403", async () => {
  await withServer(async (base) => {
    const res = await call(base, "/api/campaigns/7/demo-mark", {
      method: "DELETE",
      role: "administrador",
    });
    assert.equal(res.status, 403);
  });
});

test("demo-mark DELETE: superadmin → 500 (base ficticia)", async () => {
  await withServer(async (base) => {
    const res = await call(base, "/api/campaigns/7/demo-mark", {
      method: "DELETE",
      role: "superadmin",
    });
    assert.equal(res.status, 500);
  });
});

// ─── Purga definitiva ────────────────────────────────────────────────────────

test("demo-purge: sin sesión → 401", async () => {
  await withServer(async (base) => {
    const res = await call(base, "/api/campaigns/7/demo-purge", {
      method: "POST",
      body: purgeBody(),
    });
    assert.equal(res.status, 401);
  });
});

test("demo-purge: un administrador normal → 403", async () => {
  await withServer(async (base) => {
    const res = await call(base, "/api/campaigns/7/demo-purge", {
      method: "POST",
      role: "administrador",
      body: purgeBody(),
    });
    assert.equal(res.status, 403);
  });
});

test("demo-purge: un moderador → 403", async () => {
  await withServer(async (base) => {
    const res = await call(base, "/api/campaigns/7/demo-purge", {
      method: "POST",
      role: "moderador",
      body: purgeBody(),
    });
    assert.equal(res.status, 403);
  });
});

test("demo-purge: id inválido → 400", async () => {
  await withServer(async (base) => {
    const res = await call(base, "/api/campaigns/0/demo-purge", {
      method: "POST",
      role: "superadmin",
      body: purgeBody(),
    });
    assert.equal(res.status, 400);
  });
});

test("demo-purge: sin confirmación explícita → 400", async () => {
  await withServer(async (base) => {
    const res = await call(base, "/api/campaigns/7/demo-purge", {
      method: "POST",
      role: "superadmin",
      body: purgeBody({ confirm: undefined }),
    });
    assert.equal(res.status, 400);
    const payload = await res.json();
    assert.equal(payload.code, "confirmation_required");
  });
});

test("demo-purge: identificador que no coincide con la campaña → 400", async () => {
  await withServer(async (base) => {
    const res = await call(base, "/api/campaigns/7/demo-purge", {
      method: "POST",
      role: "superadmin",
      body: purgeBody({ identifier: "12" }),
    });
    assert.equal(res.status, 400);
    const payload = await res.json();
    assert.equal(payload.code, "identifier_mismatch");
    assert.match(payload.message, /\(7\)/);
  });
});

test("demo-purge: motivo demasiado corto → 400", async () => {
  await withServer(async (base) => {
    const res = await call(base, "/api/campaigns/7/demo-purge", {
      method: "POST",
      role: "superadmin",
      body: purgeBody({ reason: "x" }),
    });
    assert.equal(res.status, 400);
    const payload = await res.json();
    assert.equal(payload.code, "reason_required");
  });
});

test("demo-purge: sin contraseña de reautenticación → 400 (no toca la base)", async () => {
  await withServer(async (base) => {
    const res = await call(base, "/api/campaigns/7/demo-purge", {
      method: "POST",
      role: "superadmin",
      body: purgeBody({ password: "" }),
    });
    assert.equal(res.status, 400);
    const payload = await res.json();
    assert.equal(payload.code, "reauth_required");
  });
});

test("demo-purge: petición completa de superadmin pasa el gate", async () => {
  await withServer(async (base) => {
    const res = await call(base, "/api/campaigns/7/demo-purge", {
      method: "POST",
      role: "superadmin",
      body: purgeBody(),
    });
    // Llega a la verificación de identidad (base ficticia → 500), nunca a un
    // 400/401/403: la forma de la petición es correcta.
    assert.equal(res.status, 500);
  });
});

// ─── Respaldos de la purga ───────────────────────────────────────────────────

test("backups: sin sesión → 401", async () => {
  await withServer(async (base) => {
    const res = await call(base, "/api/admin/campaign-demo-purge/backups");
    assert.equal(res.status, 401);
  });
});

test("backups: un administrador normal → 403", async () => {
  await withServer(async (base) => {
    const res = await call(base, "/api/admin/campaign-demo-purge/backups", {
      role: "administrador",
    });
    assert.equal(res.status, 403);
  });
});

test("backups: superadmin → 500 (base ficticia)", async () => {
  await withServer(async (base) => {
    const res = await call(base, "/api/admin/campaign-demo-purge/backups", {
      role: "superadmin",
    });
    assert.equal(res.status, 500);
  });
});

test("backups/:id: identificador inválido → 400", async () => {
  await withServer(async (base) => {
    const res = await call(base, "/api/admin/campaign-demo-purge/backups/abc", {
      role: "superadmin",
    });
    assert.equal(res.status, 400);
  });
});

test("backups/:id: superadmin → 500 (base ficticia)", async () => {
  await withServer(async (base) => {
    const res = await call(base, "/api/admin/campaign-demo-purge/backups/3", {
      role: "superadmin",
    });
    assert.equal(res.status, 500);
  });
});

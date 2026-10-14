import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";

// volunteer-teams.ts importa @workspace/db (exige DATABASE_URL al cargar).
process.env.DATABASE_URL ??= "postgres://localhost:5432/nonexistent";

const { default: volunteerTeamsRouter } = await import("./dist/routes/volunteer-teams.mjs");

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.log = { error() {}, warn() {}, info() {}, debug() {} };
    const role = req.headers["x-test-role"];
    if (typeof role === "string" && role) {
      req.session = { adminUser: { id: 1, username: "u", role } };
    }
    next();
  });
  app.use("/api", volunteerTeamsRouter);
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

function call(base, path, { role, method = "GET", body } = {}) {
  return fetch(`${base}/api${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(role ? { "x-test-role": role } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

test("listar equipos sin sesión → 401", async () => {
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await call(base, "/admin/volunteer-teams");
    assert.equal(res.status, 401);
  });
});

test("listar equipos con rol sin permiso (supervisor) → 403", async () => {
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await call(base, "/admin/volunteer-teams", { role: "supervisor" });
    assert.equal(res.status, 403);
  });
});

test("crear equipo con nombre demasiado corto → 400 (sin tocar la base)", async () => {
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await call(base, "/admin/volunteer-teams", {
      role: "moderador",
      method: "POST",
      body: { name: "ab" },
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error, "validation_error");
  });
});

test("asignar equipo con ID inválido → 400", async () => {
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await call(base, "/admin/volunteers/abc/teams", {
      role: "moderador",
      method: "POST",
      body: { teamId: 1 },
    });
    assert.equal(res.status, 400);
  });
});

test("cerrar pertenencia con ID inválido → 400", async () => {
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await call(base, "/admin/volunteers/abc/teams/1/leave", {
      role: "moderador",
      method: "PATCH",
    });
    assert.equal(res.status, 400);
  });
});

test("registrar participación con tipo inválido → 400", async () => {
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await call(base, "/admin/volunteers/1/participations", {
      role: "moderador",
      method: "POST",
      body: { activityType: "fiesta", title: "Fiesta", participatedAt: "2026-10-01" },
    });
    assert.equal(res.status, 400);
  });
});

test("registrar participación con fecha futura → 400", async () => {
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await call(base, "/admin/volunteers/1/participations", {
      role: "moderador",
      method: "POST",
      body: {
        activityType: "brigada",
        title: "Brigada futura",
        participatedAt: "2099-01-01T00:00:00Z",
      },
    });
    assert.equal(res.status, 400);
  });
});

test("historial con ID inválido → 400", async () => {
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await call(base, "/admin/volunteers/abc/participations", { role: "moderador" });
    assert.equal(res.status, 400);
  });
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { hasRole, requireRole, ROLES } from "./dist/middleware/roles.mjs";

function mockRes() {
  const res = { statusCode: 200, body: null };
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (body) => {
    res.body = body;
    return res;
  };
  return res;
}

test("hasRole: superadmin siempre pasa (aunque no esté en la lista)", () => {
  assert.equal(hasRole({ role: "superadmin" }, ROLES.ADMIN), true);
  assert.equal(hasRole({ role: "superadmin" }, ROLES.MODERATOR), true);
  assert.equal(hasRole({ role: "superadmin" }), true);
});

test("hasRole: rol permitido pasa y no permitido falla", () => {
  assert.equal(hasRole({ role: "administrador" }, ROLES.ADMIN, ROLES.SUPERADMIN), true);
  assert.equal(hasRole({ role: "moderador" }, ROLES.MODERATOR), true);
  assert.equal(hasRole({ role: "moderador" }, ROLES.ADMIN), false);
  assert.equal(hasRole(undefined, ROLES.ADMIN), false);
  assert.equal(hasRole({ role: null }, ROLES.ADMIN), false);
});

test("requireRole: rechaza con 403 sin sesión", () => {
  const res = mockRes();
  let nextCalled = false;
  requireRole(ROLES.ADMIN)({ session: {} }, res, () => {
    nextCalled = true;
  });
  assert.equal(res.statusCode, 403);
  assert.equal(res.body?.error, "forbidden");
  assert.equal(nextCalled, false);
});

test("requireRole: rechaza con 403 a un moderador en rutas de administrador", () => {
  const res = mockRes();
  let nextCalled = false;
  requireRole(ROLES.ADMIN)(
    { session: { adminUser: { id: 2, username: "mod", role: "moderador" } } },
    res,
    () => {
      nextCalled = true;
    },
  );
  assert.equal(res.statusCode, 403);
  assert.equal(nextCalled, false);
});

test("requireRole: permite el paso a un administrador", () => {
  const res = mockRes();
  let nextCalled = false;
  requireRole(ROLES.ADMIN)(
    { session: { adminUser: { id: 1, username: "admin", role: "administrador" } } },
    res,
    () => {
      nextCalled = true;
    },
  );
  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, 200);
});

test("requireRole: permite el paso a un superadmin aunque no esté en la lista", () => {
  const res = mockRes();
  let nextCalled = false;
  requireRole(ROLES.MODERATOR)(
    { session: { adminUser: { id: 0, username: "super", role: "superadmin" } } },
    res,
    () => {
      nextCalled = true;
    },
  );
  assert.equal(nextCalled, true);
});

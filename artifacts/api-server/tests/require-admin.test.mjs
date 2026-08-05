import { test } from "node:test";
import assert from "node:assert/strict";
import { requireAdmin } from "./dist/middleware/require-admin.mjs";

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

test("requireAdmin: rechaza con 401 cuando no hay sesión", () => {
  const res = mockRes();
  let nextCalled = false;
  requireAdmin({ session: {} }, res, () => {
    nextCalled = true;
  });
  assert.equal(res.statusCode, 401);
  assert.equal(res.body?.error, "unauthorized");
  assert.equal(nextCalled, false);
});

test("requireAdmin: rechaza con 401 cuando no hay adminUser", () => {
  const res = mockRes();
  let nextCalled = false;
  requireAdmin({ session: { adminUser: null } }, res, () => {
    nextCalled = true;
  });
  assert.equal(res.statusCode, 401);
  assert.equal(nextCalled, false);
});

test("requireAdmin: permite el paso con adminUser en sesión", () => {
  const res = mockRes();
  let nextCalled = false;
  requireAdmin(
    { session: { adminUser: { id: 1, username: "admin", role: "superadmin" } } },
    res,
    () => {
      nextCalled = true;
    },
  );
  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, 200);
});

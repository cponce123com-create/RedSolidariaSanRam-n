// Registro de auditoría (funciones puras, sin DB).
import { test } from "node:test";
import assert from "node:assert/strict";

const {
  AUDIT_ACTIONS,
  AUDIT_RESOURCES,
  auditActionLabel,
  auditContext,
  isAuditAction,
  redactSensitiveDetails,
} = await import("./dist/lib/audit.mjs");

test("acciones de auditoría: se reconocen y tienen etiqueta legible", () => {
  assert.equal(isAuditAction("DONATION_RECONCILED"), true);
  assert.equal(isAuditAction("LOGOUT"), false);
  assert.equal(isAuditAction(null), false);
  assert.equal(
    auditActionLabel(AUDIT_ACTIONS.donationReconciled),
    "Donación conciliada con el banco",
  );
  assert.equal(auditActionLabel("OTRA_COSA"), "OTRA_COSA");
  assert.equal(AUDIT_RESOURCES.donations, "donations");
  assert.equal(AUDIT_RESOURCES.campaigns, "campaigns");
});

test("redactSensitiveDetails: oculta claves sensibles, incluidas anidadas", () => {
  const out = redactSensitiveDetails({
    status: "reconciled",
    password: "x",
    nested: { token: "abc", ok: 1 },
    list: [{ secret: "s" }],
  });
  assert.deepEqual(out, {
    status: "reconciled",
    password: "[REDACTED]",
    nested: { token: "[REDACTED]", ok: 1 },
    list: [{ secret: "[REDACTED]" }],
  });
});

test("redactSensitiveDetails: respeta escalares, nulos y arrays", () => {
  assert.equal(redactSensitiveDetails(null), null);
  assert.equal(redactSensitiveDetails("texto"), "texto");
  assert.equal(redactSensitiveDetails(7), 7);
  assert.deepEqual(redactSensitiveDetails([1, "a"]), [1, "a"]);
});

test("auditContext: extrae actor y origen de la petición", () => {
  const ctx = auditContext({
    session: { adminUser: { id: 3, username: "ana" } },
    ip: "10.0.0.1",
    get: (name) => (name === "user-agent" ? "jest" : undefined),
  });
  assert.deepEqual(ctx, {
    userId: 3,
    username: "ana",
    ipAddress: "10.0.0.1",
    userAgent: "jest",
  });
});

test("auditContext: tolera peticiones parciales (sin sesión ni ip)", () => {
  assert.deepEqual(auditContext({}), {
    userId: null,
    username: null,
    ipAddress: null,
    userAgent: null,
  });
  assert.equal(
    auditContext({ connection: { remoteAddress: "127.0.0.1" } }).ipAddress,
    "127.0.0.1",
  );
});

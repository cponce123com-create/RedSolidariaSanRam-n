// Guardas de administración de usuarios (V14-1.3) — lógica PURA.
//
// Regresión que blindan: ni el borrado ni la edición de usuarios administrativos
// comprobaban nada más allá de «eres superadmin», así que un superadmin podía
// eliminarse a sí mismo o dejar el panel SIN ningún superadmin activo (bloqueo total
// sin recuperación desde la interfaz). Estas reglas viven en el servidor.
import { test } from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL ??= "postgres://localhost:5432/nonexistent";

const { ADMIN_ROLES, SUPERADMIN_ROLE, guardDeleteAdminUser, guardUpdateAdminUser, shouldRevokeSessions } =
  await import("./dist/lib/admin-user-guards.mjs");

const superadmin = (id, active = true) => ({
  id,
  username: `super${id}`,
  role: SUPERADMIN_ROLE,
  active,
});
const moderator = (id, active = true) => ({ id, username: `mod${id}`, role: "moderador", active });

const ctx = (target, activeSuperadmins, actorId = 99) => ({
  actor: { id: actorId, username: `actor${actorId}` },
  target,
  activeSuperadmins,
});

// ─── Borrado ─────────────────────────────────────────────────────────────────

test("no se puede eliminar la propia cuenta", () => {
  const result = guardDeleteAdminUser(ctx(superadmin(7), 3, 7));
  assert.equal(result.ok, false);
  assert.equal(result.code, "self_deletion");
  assert.equal(result.status, 409);
});

test("no se puede eliminar al ÚLTIMO superadmin activo", () => {
  const result = guardDeleteAdminUser(ctx(superadmin(7), 1));
  assert.equal(result.ok, false);
  assert.equal(result.code, "last_superadmin");
  assert.equal(result.status, 409);
});

test("con dos superadmins activos, eliminar a uno SÍ se permite", () => {
  assert.equal(guardDeleteAdminUser(ctx(superadmin(7), 2)).ok, true);
});

test("eliminar a un moderador o a un superadmin inactivo se permite", () => {
  assert.equal(guardDeleteAdminUser(ctx(moderator(4), 1)).ok, true);
  // Un superadmin ya desactivado no cuenta para el bloqueo: el panel no se queda sin
  // nadie activo por eliminarlo.
  assert.equal(guardDeleteAdminUser(ctx(superadmin(5, false), 1)).ok, true);
});

test("un usuario inexistente devuelve not_found", () => {
  const result = guardDeleteAdminUser(ctx(null, 5));
  assert.equal(result.ok, false);
  assert.equal(result.code, "not_found");
  assert.equal(result.status, 404);
});

// ─── Edición ─────────────────────────────────────────────────────────────────

test("no se puede desactivar al ÚLTIMO superadmin activo", () => {
  const result = guardUpdateAdminUser({ ...ctx(superadmin(7), 1), changes: { active: false } });
  assert.equal(result.ok, false);
  assert.equal(result.code, "last_superadmin");
});

test("no se puede degradar al ÚLTIMO superadmin activo", () => {
  const result = guardUpdateAdminUser({
    ...ctx(superadmin(7), 1),
    changes: { role: "administrador" },
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, "last_superadmin");
});

test("no se puede desactivar la propia cuenta", () => {
  const result = guardUpdateAdminUser({ ...ctx(moderator(4), 3, 4), changes: { active: false } });
  assert.equal(result.ok, false);
  assert.equal(result.code, "self_deactivation");
});

test("con otro superadmin activo, degradar o desactivar SÍ se permite", () => {
  assert.equal(
    guardUpdateAdminUser({ ...ctx(superadmin(7), 2), changes: { active: false } }).ok,
    true,
  );
  assert.equal(
    guardUpdateAdminUser({ ...ctx(superadmin(7), 2), changes: { role: "administrador" } }).ok,
    true,
  );
});

test("un rol inventado se rechaza (no se puede escalar a un rol que no existe)", () => {
  const result = guardUpdateAdminUser({
    ...ctx(moderator(4), 3),
    changes: { role: "root" },
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, "invalid_role");
  assert.equal(result.status, 400);
  // Todos los roles declarados se aceptan.
  for (const role of ADMIN_ROLES) {
    assert.equal(guardUpdateAdminUser({ ...ctx(moderator(4), 3), changes: { role } }).ok, true, role);
  }
});

test("editar solo el nombre (sin tocar rol ni estado) no se bloquea", () => {
  assert.equal(
    guardUpdateAdminUser({ ...ctx(superadmin(7), 1), changes: {} }).ok,
    true,
    "el último superadmin puede seguir editando sus propios datos",
  );
});

// ─── Revocación de sesiones ──────────────────────────────────────────────────

test("desactivar o cambiar el rol revoca las sesiones abiertas", () => {
  assert.deepEqual(shouldRevokeSessions(superadmin(7), { active: false }), {
    revoke: true,
    reason: "deactivated",
  });
  assert.deepEqual(shouldRevokeSessions(moderator(4), { role: "administrador" }), {
    revoke: true,
    reason: "role_changed",
  });
});

test("un cambio que no altera permisos no revoca nada", () => {
  assert.deepEqual(shouldRevokeSessions(moderator(4), { role: "moderador" }), {
    revoke: false,
    reason: null,
  });
  assert.deepEqual(shouldRevokeSessions(moderator(4), { active: true }), {
    revoke: false,
    reason: null,
  });
  assert.deepEqual(shouldRevokeSessions(moderator(4), {}), { revoke: false, reason: null });
  assert.deepEqual(shouldRevokeSessions(moderator(4), { username: "mod4" }), {
    revoke: false,
    reason: null,
  });
});

test("cambiar la contraseña o el nombre de usuario revoca las sesiones abiertas", () => {
  assert.deepEqual(shouldRevokeSessions(moderator(4), { password: true }), {
    revoke: true,
    reason: "password_changed",
  });
  assert.deepEqual(shouldRevokeSessions(moderator(4), { username: "nuevo" }), {
    revoke: true,
    reason: "username_changed",
  });
});

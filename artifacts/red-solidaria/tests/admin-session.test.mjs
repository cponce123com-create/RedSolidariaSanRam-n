// Acceso al panel: decisión del gate como función pura (FE-03 / FE-04).
import { test } from "node:test";
import assert from "node:assert/strict";

const {
  ADMIN_LOGIN_PATH,
  ADMIN_PANEL_ROLES,
  errorStatus,
  isAdminPanelRole,
  normalizeRole,
  resolvePanelGate,
} = await import("./dist/admin-session.mjs");

test("roles del panel: son los cuatro que acepta la API", () => {
  assert.deepEqual([...ADMIN_PANEL_ROLES], ["superadmin", "administrador", "moderador", "supervisor"]);
  assert.equal(ADMIN_LOGIN_PATH, "/admin/login");
});

test("rol: normaliza mayúsculas y espacios", () => {
  assert.equal(normalizeRole("  Moderador "), "moderador");
  assert.equal(normalizeRole(""), null);
  assert.equal(normalizeRole(undefined), null);
  assert.equal(normalizeRole(42), null);
});

test("rol: solo los cuatro roles conocidos pueden entrar", () => {
  for (const role of ADMIN_PANEL_ROLES) {
    assert.equal(isAdminPanelRole(role), true, `${role} debería entrar`);
  }
  for (const role of ["", "  ", "invitado", "SUPERADMIN ", "admin", null, undefined, 7]) {
    assert.equal(isAdminPanelRole(role), role === "SUPERADMIN " ? true : false, `${role} no debería entrar`);
  }
});

test("estado HTTP: se lee de forma defensiva", () => {
  assert.equal(errorStatus({ status: 401 }), 401);
  assert.equal(errorStatus({ status: "401" }), null);
  assert.equal(errorStatus(new Error("boom")), null);
  assert.equal(errorStatus(null), null);
  assert.equal(errorStatus(undefined), null);
  assert.equal(errorStatus("401"), null);
});

test("gate: mientras carga no se decide nada", () => {
  assert.deepEqual(resolvePanelGate({ isLoading: true, error: null, user: null }), { state: "loading" });
});

test("gate: 401 manda al formulario de acceso", () => {
  assert.deepEqual(
    resolvePanelGate({ isLoading: false, error: { status: 401 }, user: null }),
    { state: "unauthenticated", redirectTo: ADMIN_LOGIN_PATH },
  );
});

test("gate: sin error, sin datos y sin carga tampoco hay sesión", () => {
  assert.deepEqual(
    resolvePanelGate({ isLoading: false, error: null, user: undefined }),
    { state: "unauthenticated", redirectTo: ADMIN_LOGIN_PATH },
  );
});

test("gate: un 500 o un fallo de red NO expulsa al login (FE-03)", () => {
  assert.deepEqual(
    resolvePanelGate({ isLoading: false, error: { status: 500 }, user: null }),
    { state: "unavailable", status: 500 },
  );
  assert.deepEqual(
    resolvePanelGate({ isLoading: false, error: new Error("Failed to fetch"), user: null }),
    { state: "unavailable", status: null },
  );
});

test("gate: 403 es «sin permiso», no «sin sesión»", () => {
  assert.deepEqual(
    resolvePanelGate({ isLoading: false, error: { status: 403 }, user: null }),
    { state: "forbidden", role: null },
  );
});

test("gate: un rol desconocido no entra al panel", () => {
  assert.deepEqual(
    resolvePanelGate({ isLoading: false, error: null, user: { role: "invitado" } }),
    { state: "forbidden", role: "invitado" },
  );
  assert.deepEqual(
    resolvePanelGate({ isLoading: false, error: null, user: { role: "" } }),
    { state: "forbidden", role: null },
  );
  assert.deepEqual(
    resolvePanelGate({ isLoading: false, error: null, user: {} }),
    { state: "forbidden", role: null },
  );
});

test("gate: los cuatro roles conocidos entran", () => {
  for (const role of ADMIN_PANEL_ROLES) {
    assert.deepEqual(
      resolvePanelGate({ isLoading: false, error: null, user: { role } }),
      { state: "ready", role },
    );
  }
  // Con rol en mayúsculas y espacios también entra, ya normalizado.
  assert.deepEqual(
    resolvePanelGate({ isLoading: false, error: null, user: { role: " Administrador " } }),
    { state: "ready", role: "administrador" },
  );
});

test("gate: con sesión cargada, un error posterior no expulsa al usuario", () => {
  assert.deepEqual(
    resolvePanelGate({ isLoading: false, error: { status: 500 }, user: { role: "moderador" } }),
    { state: "ready", role: "moderador" },
  );
  assert.deepEqual(
    resolvePanelGate({ isLoading: true, error: { status: 401 }, user: { role: "superadmin" } }),
    { state: "ready", role: "superadmin" },
  );
});

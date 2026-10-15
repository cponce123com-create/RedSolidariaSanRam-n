// 2FA del superadmin de respaldo por variables de entorno (V7.2.3) — lógica PURA.
//
// Regresión cubierta: el superadmin de entorno (ADMIN_USERNAME, sesión id 0) no
// tiene fila en admin_users, así que /admin/2fa/* le respondía 404 y quedaba
// SIEMPRE solo con contraseña. Estas pruebas fijan cuándo su segundo factor debe
// exigirse y cuándo el escape hatch lo inutiliza.
import { test } from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL ??= "postgres://localhost:5432/nonexistent";
// El nombre del superadmin de entorno se lee al cargar el módulo: se fija antes.
process.env.ADMIN_USERNAME = "superadmin-de-prueba";

const {
  ENV_SUPERADMIN_ID,
  ENV_TWO_FACTOR_KILL_SWITCH,
  envTwoFactorActive,
  isEnvTwoFactorDisabledByEnv,
  resolveTwoFactorAccount,
} = await import("./dist/lib/two-factor-account.mjs");

// ─── Cuándo debe exigirse ────────────────────────────────────────────────────

test("el 2FA del entorno se exige solo si está activado Y hay secreto", () => {
  assert.equal(envTwoFactorActive({ enabled: true, secret: "JBSWY3DPEHPK3PXP" }, false), true);
  assert.equal(envTwoFactorActive({ enabled: false, secret: "JBSWY3DPEHPK3PXP" }, false), false);
  // Estado incoherente: activado pero sin secreto no puede exigir nada.
  assert.equal(envTwoFactorActive({ enabled: true, secret: null }, false), false);
  assert.equal(envTwoFactorActive({ enabled: true, secret: "" }, false), false);
});

test("el escape hatch manda sobre cualquier estado guardado", () => {
  assert.equal(envTwoFactorActive({ enabled: true, secret: "JBSWY3DPEHPK3PXP" }, true), false);
  assert.equal(envTwoFactorActive({ enabled: false, secret: null }, true), false);
});

test("el escape hatch se activa solo con el valor exacto '1'", () => {
  const original = process.env[ENV_TWO_FACTOR_KILL_SWITCH];
  try {
    delete process.env[ENV_TWO_FACTOR_KILL_SWITCH];
    assert.equal(isEnvTwoFactorDisabledByEnv(), false);

    process.env[ENV_TWO_FACTOR_KILL_SWITCH] = "0";
    assert.equal(isEnvTwoFactorDisabledByEnv(), false, "«0» no desactiva nada");

    process.env[ENV_TWO_FACTOR_KILL_SWITCH] = "true";
    assert.equal(isEnvTwoFactorDisabledByEnv(), false, "solo el valor '1'");

    process.env[ENV_TWO_FACTOR_KILL_SWITCH] = "1";
    assert.equal(isEnvTwoFactorDisabledByEnv(), true);
  } finally {
    if (original === undefined) delete process.env[ENV_TWO_FACTOR_KILL_SWITCH];
    else process.env[ENV_TWO_FACTOR_KILL_SWITCH] = original;
  }
});

test("el identificador del superadmin de entorno es 0 (no es una fila)", () => {
  assert.equal(ENV_SUPERADMIN_ID, 0);
});

// ─── Resolución de la cuenta ─────────────────────────────────────────────────

test("la sesión id 0 se resuelve como la cuenta de entorno, sin tocar la base", async () => {
  // No hay fila que buscar: si esto consultara la base, con la URL ficticia
  // lanzaría. Que devuelva la cuenta demuestra que el caso está contemplado.
  const account = await resolveTwoFactorAccount({ id: 0, username: "otro" });
  assert.equal(account?.isEnvAccount, true);
  assert.equal(account?.id, 0);
  // El nombre del autenticador es el del superadmin de entorno configurado.
  assert.equal(account?.username, "superadmin-de-prueba");
});

test("la cuenta de entorno expone las cuatro operaciones del contrato", async () => {
  const account = await resolveTwoFactorAccount({ id: 0, username: "otro" });
  for (const method of ["state", "saveSecret", "enable", "clear"]) {
    assert.equal(typeof account?.[method], "function", `falta ${method}`);
  }
});

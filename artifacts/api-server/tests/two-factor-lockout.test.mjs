import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

const {
  MAX_2FA_ATTEMPTS,
  TWO_FA_LOCKOUT_MS,
  clearFailedAttempts,
  clearFailedAttemptsForUser,
  getLockoutRemainingMs,
  lockoutKey,
  registerFailedAttempt,
  resetLockoutStore,
} = await import("./dist/lib/two-factor-lockout.mjs");

beforeEach(() => resetLockoutStore());

test("sin intentos previos → nunca bloqueado", () => {
  assert.equal(getLockoutRemainingMs("1"), 0);
});

test("tras menos de MAX_2FA_ATTEMPTS fallos → aún no bloqueado", () => {
  for (let i = 0; i < MAX_2FA_ATTEMPTS - 1; i++) {
    const { locked, remainingMs } = registerFailedAttempt("1");
    assert.equal(locked, false);
    assert.equal(remainingMs, 0);
  }
  assert.equal(getLockoutRemainingMs("1"), 0);
});

test("tras MAX_2FA_ATTEMPTS fallos → bloqueado por TWO_FA_LOCKOUT_MS", () => {
  let result;
  for (let i = 0; i < MAX_2FA_ATTEMPTS; i++) {
    result = registerFailedAttempt("1");
  }
  assert.equal(result.locked, true);
  assert.equal(result.remainingMs, TWO_FA_LOCKOUT_MS);
  assert.ok(getLockoutRemainingMs("1") > 0);
});

test("clearFailedAttempts desbloquea la clave", () => {
  for (let i = 0; i < MAX_2FA_ATTEMPTS; i++) registerFailedAttempt("1");
  assert.ok(getLockoutRemainingMs("1") > 0);
  clearFailedAttempts("1");
  assert.equal(getLockoutRemainingMs("1"), 0);
});

test("el bloqueo expira al superar la ventana (mock timers sobre Date)", () => {
  const mock = test.mock.timers;
  mock.enable({ apis: ["Date"] });
  try {
    for (let i = 0; i < MAX_2FA_ATTEMPTS; i++) registerFailedAttempt("2");
    assert.ok(getLockoutRemainingMs("2") > 0);
    mock.tick(TWO_FA_LOCKOUT_MS + 1000);
    assert.equal(getLockoutRemainingMs("2"), 0);
  } finally {
    mock.reset();
  }
});

test("claves independientes: los fallos de una no bloquean a otra", () => {
  for (let i = 0; i < MAX_2FA_ATTEMPTS; i++) registerFailedAttempt("10");
  assert.ok(getLockoutRemainingMs("10") > 0);
  assert.equal(getLockoutRemainingMs("11"), 0);
});

// ─── SEC-03: el bloqueo es por ORIGEN + cuenta, no solo por cuenta ───────────

test("lockoutKey: origen + cuenta, con respaldo si no hay IP", () => {
  assert.equal(lockoutKey("1.2.3.4", 7), "1.2.3.4:7");
  assert.equal(lockoutKey("  1.2.3.4  ", "7"), "1.2.3.4:7");
  assert.equal(lockoutKey(undefined, 7), "unknown:7");
  assert.equal(lockoutKey("   ", 7), "unknown:7");
});

test("SEC-03: los fallos desde un origen NO bloquean al administrador legítimo", () => {
  // Antes el contador se indexaba solo por userId (que viaja en el body del
  // login), así que un tercero podía dejar fuera al superadmin 15 minutos.
  const atacante = lockoutKey("10.0.0.9", 1);
  for (let i = 0; i < MAX_2FA_ATTEMPTS; i++) registerFailedAttempt(atacante);
  assert.ok(getLockoutRemainingMs(atacante) > 0);
  // La misma cuenta desde otro origen sigue pudiendo intentarlo.
  assert.equal(getLockoutRemainingMs(lockoutKey("192.168.1.5", 1)), 0);
});

test("clearFailedAttemptsForUser limpia la cuenta en TODOS los orígenes", () => {
  const origenA = lockoutKey("10.0.0.9", 1);
  const origenB = lockoutKey("10.0.0.10", 1);
  for (let i = 0; i < MAX_2FA_ATTEMPTS; i++) {
    registerFailedAttempt(origenA);
    registerFailedAttempt(origenB);
  }
  assert.ok(getLockoutRemainingMs(origenA) > 0);

  assert.equal(clearFailedAttemptsForUser(1), 2);
  assert.equal(getLockoutRemainingMs(origenA), 0);
  assert.equal(getLockoutRemainingMs(origenB), 0);
});

test("clearFailedAttemptsForUser no toca otras cuentas", () => {
  const otra = lockoutKey("10.0.0.9", 2);
  for (let i = 0; i < MAX_2FA_ATTEMPTS; i++) registerFailedAttempt(otra);
  clearFailedAttemptsForUser(1);
  assert.ok(getLockoutRemainingMs(otra) > 0);
});

test("clearFailedAttemptsForUser sobre una cuenta sin fallos → 0", () => {
  assert.equal(clearFailedAttemptsForUser(99), 0);
});

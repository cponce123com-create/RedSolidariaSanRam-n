import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

const {
  MAX_2FA_ATTEMPTS,
  TWO_FA_LOCKOUT_MS,
  getLockoutRemainingMs,
  registerFailedAttempt,
  clearFailedAttempts,
  resetLockoutStore,
} = await import("./dist/lib/two-factor-lockout.mjs");

beforeEach(() => resetLockoutStore());

test("sin intentos previos → nunca bloqueado", () => {
  assert.equal(getLockoutRemainingMs(1), 0);
});

test("tras menos de MAX_2FA_ATTEMPTS fallos → aún no bloqueado", () => {
  for (let i = 0; i < MAX_2FA_ATTEMPTS - 1; i++) {
    const { locked, remainingMs } = registerFailedAttempt(1);
    assert.equal(locked, false);
    assert.equal(remainingMs, 0);
  }
  assert.equal(getLockoutRemainingMs(1), 0);
});

test("tras MAX_2FA_ATTEMPTS fallos → bloqueado por TWO_FA_LOCKOUT_MS", () => {
  let result;
  for (let i = 0; i < MAX_2FA_ATTEMPTS; i++) {
    result = registerFailedAttempt(1);
  }
  assert.equal(result.locked, true);
  assert.equal(result.remainingMs, TWO_FA_LOCKOUT_MS);
  assert.ok(getLockoutRemainingMs(1) > 0);
});

test("clearFailedAttempts desbloquea la cuenta", () => {
  for (let i = 0; i < MAX_2FA_ATTEMPTS; i++) registerFailedAttempt(1);
  assert.ok(getLockoutRemainingMs(1) > 0);
  clearFailedAttempts(1);
  assert.equal(getLockoutRemainingMs(1), 0);
});

test("el bloqueo expira al superar la ventana (mock timers sobre Date)", () => {
  const mock = test.mock.timers;
  mock.enable({ apis: ["Date"] });
  try {
    for (let i = 0; i < MAX_2FA_ATTEMPTS; i++) registerFailedAttempt(2);
    assert.ok(getLockoutRemainingMs(2) > 0);
    mock.tick(TWO_FA_LOCKOUT_MS + 1000);
    assert.equal(getLockoutRemainingMs(2), 0);
  } finally {
    mock.reset();
  }
});

test("cuentas independientes: los fallos de una no bloquean a otra", () => {
  for (let i = 0; i < MAX_2FA_ATTEMPTS; i++) registerFailedAttempt(10);
  assert.ok(getLockoutRemainingMs(10) > 0);
  assert.equal(getLockoutRemainingMs(11), 0);
});

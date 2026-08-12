import { test } from "node:test";
import assert from "node:assert/strict";

const { generateRandomPassword } = await import("./dist/lib/random-password.mjs");

test("genera contraseñas de 24 caracteres base64url", () => {
  const password = generateRandomPassword();
  assert.equal(password.length, 24);
  assert.match(password, /^[A-Za-z0-9_-]+$/);
});

test("genera contraseñas distintas en cada llamada", () => {
  const seen = new Set();
  for (let i = 0; i < 100; i++) seen.add(generateRandomPassword());
  assert.equal(seen.size, 100);
});

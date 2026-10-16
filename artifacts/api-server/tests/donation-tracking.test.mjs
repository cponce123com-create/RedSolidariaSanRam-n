// Código de seguimiento, teléfono peruano e idempotencia (V20 · Fase 2/3).
import { test } from "node:test";
import assert from "node:assert/strict";

const {
  normalizePePhone,
  isValidPePhone,
  generateTrackingCode,
  isValidTrackingCode,
  normalizeDedupeToken,
  isValidDedupeToken,
  TRACKING_CODE_LENGTH,
} = await import("./dist/lib/donation-tracking.mjs");

test("teléfono: normaliza móviles peruanos a +51XXXXXXXXX", () => {
  assert.equal(normalizePePhone("921615737"), "+51921615737");
  assert.equal(normalizePePhone("921 615 737"), "+51921615737");
  assert.equal(normalizePePhone("+51 921 615 737"), "+51921615737");
  assert.equal(normalizePePhone("+51921615737"), "+51921615737");
  assert.equal(normalizePePhone("51921615737"), "+51921615737");
  assert.equal(normalizePePhone("0921615737"), "+51921615737");
  assert.equal(normalizePePhone("(921)-615-737"), "+51921615737");
});

test("teléfono: rechaza lo que no es un móvil peruano", () => {
  for (const invalid of ["", "123456", "123456789", "821615737", "92161573", "9216157378", "abc", null, undefined, 921615737]) {
    assert.equal(normalizePePhone(invalid), "", `${String(invalid)} debería rechazarse`);
    assert.equal(isValidPePhone(invalid), false);
  }
  assert.equal(isValidPePhone("+51 921 615 737"), true);
});

test("código de seguimiento: formato legible y sin caracteres ambiguos", () => {
  const code = generateTrackingCode(new Date("2026-03-01T00:00:00Z"), () => 0);
  assert.equal(code, "RSR-2026-AAAAAA");
  assert.equal(isValidTrackingCode(code), true);
  // Alfabeto sin I, O, 0 ni 1 (se dicta por teléfono).
  assert.equal(/[IO01]/.test(code.slice(9)), false);
  assert.equal(code.split("-")[2].length, TRACKING_CODE_LENGTH);
  // Dos códigos con aleatoriedad distinta son distintos.
  let i = 0;
  const seq = () => (i += 1) / 40;
  assert.notEqual(generateTrackingCode(new Date("2026-01-01"), seq), generateTrackingCode(new Date("2026-01-01"), seq));
});

test("código de seguimiento: validación estricta", () => {
  assert.equal(isValidTrackingCode("RSR-2026-A7K3Q9"), true);
  assert.equal(isValidTrackingCode("RSR-2026-A7K3Q"), false); // 5 caracteres
  assert.equal(isValidTrackingCode("RSR-2026-A7K3Q9X"), false); // 7
  assert.equal(isValidTrackingCode("XXX-2026-A7K3Q9"), false); // prefijo
  assert.equal(isValidTrackingCode("RSR-26-A7K3Q9"), false); // año
  assert.equal(isValidTrackingCode("RSR-2026-A7K3QI"), false); // letra ambigua
  assert.equal(isValidTrackingCode("RSR-2026-A7K3Q0"), false); // cero ambiguo
  assert.equal(isValidTrackingCode(null), false);
  assert.equal(isValidTrackingCode(42), false);
});

test("idempotencia: solo tokens razonables", () => {
  assert.equal(normalizeDedupeToken("abc12345"), "abc12345");
  assert.equal(normalizeDedupeToken("  a1b2c3d4-e5f6  "), "a1b2c3d4-e5f6");
  assert.equal(normalizeDedupeToken("a".repeat(64)), "a".repeat(64));
  // Demasiado corto, demasiado largo o con caracteres raros → se descarta.
  assert.equal(normalizeDedupeToken("corto"), null);
  assert.equal(normalizeDedupeToken("a".repeat(65)), null);
  assert.equal(normalizeDedupeToken("token con espacios"), null);
  assert.equal(normalizeDedupeToken("token;drop table"), null);
  assert.equal(normalizeDedupeToken(null), null);
  assert.equal(isValidDedupeToken("abc12345"), true);
  assert.equal(isValidDedupeToken("x"), false);
});

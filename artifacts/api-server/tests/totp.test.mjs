import { test } from "node:test";
import assert from "node:assert/strict";

const { base32Decode, generateSecret, generateTOTP, verifyTOTP, buildOtpauthUri } = await import("./dist/lib/totp.mjs");

// Secreto del Apéndice B de RFC 6238: bytes ASCII "12345678901234567890"
const SECRET_B32 = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

test("totp: base32Decode decodifica el secreto de referencia", () => {
  const decoded = base32Decode(SECRET_B32);
  assert.equal(decoded.toString("utf8"), "12345678901234567890");
});

test("totp: genera los códigos del RFC 6238 (apéndice B, SHA-1)", () => {
  const vectors = [
    [59, "287082"],
    [1111111109, "081804"],
    [1111111111, "050471"],
    [1234567890, "005924"],
    [2000000000, "279037"],
    [20000000000, "353130"],
  ];
  for (const [t, expected] of vectors) {
    assert.equal(generateTOTP(SECRET_B32, t * 1000), expected, `T=${t}`);
  }
});

test("totp: verifyTOTP acepta el código vigente y rechaza códigos incorrectos", () => {
  const t = 1234567890 * 1000;
  const code = generateTOTP(SECRET_B32, t);
  assert.equal(verifyTOTP(SECRET_B32, code, t), true);
  assert.equal(verifyTOTP(SECRET_B32, "000000", t), false);
  assert.equal(verifyTOTP(SECRET_B32, "12345", t), false); // 5 dígitos
  assert.equal(verifyTOTP(SECRET_B32, "abcdef", t), false); // no numérico
});

test("totp: tolerancia de ±1 paso (30s) por desfase de reloj", () => {
  const t = 59 * 1000; // paso 1 (floor(59/30) = 1)
  const code = generateTOTP(SECRET_B32, t);
  assert.equal(verifyTOTP(SECRET_B32, code, t + 30 * 1000), true); // +1 paso (paso 2)
  assert.equal(verifyTOTP(SECRET_B32, code, t - 30 * 1000), true); // -1 paso (paso 0)
  assert.equal(verifyTOTP(SECRET_B32, code, t + 60 * 1000), false); // +2 pasos
});

test("totp: generateSecret produce 32 caracteres base32 (160 bits)", () => {
  const secret = generateSecret();
  assert.match(secret, /^[A-Z2-7]{32}$/);
});

test("totp: buildOtpauthUri incluye secreto, emisor y parámetros estándar", () => {
  const uri = buildOtpauthUri("ABCDEFGHIJKLMNOPQRSTUVWXYZ234567", "admin", "Red Solidaria");
  assert.ok(uri.startsWith("otpauth://totp/Red%20Solidaria:admin?"));
  assert.ok(uri.includes("secret=ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"));
  // URLSearchParams codifica el espacio como '+' en el query string
  assert.ok(uri.includes("issuer=Red+Solidaria"));
  assert.ok(uri.includes("algorithm=SHA1"));
  assert.ok(uri.includes("digits=6"));
  assert.ok(uri.includes("period=30"));
});

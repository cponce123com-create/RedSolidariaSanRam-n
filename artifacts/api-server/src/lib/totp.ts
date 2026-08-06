import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// Implementación TOTP (RFC 6238): SHA-1, 6 dígitos, paso de 30s, compatible
// con Google Authenticator y Authy. Sin dependencias externas (node:crypto).

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const DEFAULT_STEP_SECONDS = 30;
const DEFAULT_DIGITS = 6;
const DEFAULT_WINDOW = 1; // ±1 paso (30s) de tolerancia por desfase de reloj

/** Decodifica un secreto base32 (RFC 4648, sin padding) a bytes. */
export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/=+$/g, "").replace(/\s+/g, "");
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx === -1) throw new Error(`Carácter base32 inválido: ${char}`);
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 0x1f];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32_ALPHABET[(value << (5 - bits)) & 0x1f];
  return out;
}

/** Genera un secreto TOTP de 20 bytes (160 bits) codificado en base32. */
export function generateSecret(): string {
  return base32Encode(randomBytes(20));
}

function totpForCounter(secret: string, counter: number, digits: number): string {
  const key = base32Decode(secret);
  const counterBuf = Buffer.alloc(8);
  counterBuf.writeBigUInt64BE(BigInt(Math.floor(counter)));
  const hmac = createHmac("sha1", key).update(counterBuf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return (binary % 10 ** digits).toString().padStart(digits, "0");
}

/** Genera el código TOTP vigente para un timestamp (ms desde epoch). */
export function generateTOTP(secret: string, timestampMs: number = Date.now()): string {
  const counter = Math.floor(timestampMs / 1000 / DEFAULT_STEP_SECONDS);
  return totpForCounter(secret, counter, DEFAULT_DIGITS);
}

/** Verifica un código TOTP con tolerancia de ±window pasos (comparación en tiempo constante). */
export function verifyTOTP(
  secret: string,
  code: string,
  timestampMs: number = Date.now(),
  window: number = DEFAULT_WINDOW,
): boolean {
  if (typeof code !== "string" || !/^\d{6}$/.test(code)) return false;
  const counter = Math.floor(timestampMs / 1000 / DEFAULT_STEP_SECONDS);
  const expected = Buffer.from(code, "utf8");
  for (let i = -window; i <= window; i++) {
    const candidateCounter = counter + i;
    // Antes del paso 0 no existen contadores (writeBigUInt64BE no acepta negativos)
    if (candidateCounter < 0) continue;
    const candidate = Buffer.from(totpForCounter(secret, candidateCounter, DEFAULT_DIGITS), "utf8");
    if (candidate.length === expected.length && timingSafeEqual(candidate, expected)) {
      return true;
    }
  }
  return false;
}

/** Construye la URI otpauth:// para escanear con Google Authenticator/Authy. */
export function buildOtpauthUri(
  secret: string,
  account: string,
  issuer: string,
): string {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(account)}`;
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: "SHA1",
    digits: String(DEFAULT_DIGITS),
    period: String(DEFAULT_STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

/**
 * Certificados con QR (Fase 5.2 del Prompt Maestro V7, B-3).
 *
 * Reglas de diseño:
 *   - El código público es **aleatorio y no adivinable** (12 caracteres de un
 *     alfabeto de 30 sin caracteres ambiguos ni vocales): no se puede enumerar
 *     quién tiene certificado, y se puede dictar por teléfono sin confusiones.
 *   - La proyección pública NO incluye el id interno, ni el importe, ni ningún
 *     dato de contacto: un certificado no es un recibo.
 *   - Un certificado **revocado deja de publicarse** (`null`), no se muestra
 *     «revocado» con el nombre de la persona.
 *   - Revocar exige **motivo**: una revocación sin justificación no es trazable.
 *
 * Funciones PURAS y testeables (sin Express ni base de datos).
 */

import { randomInt } from "node:crypto";

export const CERTIFICATE_TYPES = [
  "donante",
  "voluntario",
  "auspiciador",
  "colaborador",
  "reconocimiento",
] as const;

export type CertificateType = (typeof CERTIFICATE_TYPES)[number];

export const CERTIFICATE_STATUSES = ["issued", "revoked"] as const;
export type CertificateStatus = (typeof CERTIFICATE_STATUSES)[number];

export const CERTIFICATE_CODE_LENGTH = 12;

/** Sin 0/O, 1/I/L (ambiguos), sin vocales (evita palabras accidentales) ni guiones. */
const CODE_ALPHABET = "23456789BCDFGHJKMNPQRSTVWXZ";

export function isCertificateType(value: unknown): value is CertificateType {
  return typeof value === "string" && (CERTIFICATE_TYPES as readonly string[]).includes(value);
}

export function isCertificateStatus(value: unknown): value is CertificateStatus {
  return typeof value === "string" && (CERTIFICATE_STATUSES as readonly string[]).includes(value);
}

/**
 * Código público nuevo. Usa aleatoriedad **criptográfica** (`randomInt`), no
 * `Math.random`: un código adivinable permitiría descubrir certificados ajenos.
 */
export function generateCertificateCode(length: number = CERTIFICATE_CODE_LENGTH): string {
  let code = "";
  for (let i = 0; i < length; i += 1) {
    code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return code;
}

/**
 * Normaliza un código escrito a mano: quita espacios y guiones y pasa a
 * mayúsculas, para que «abcd-efgh» y «ABCD EFGH» sean el mismo certificado.
 */
export function normalizeCertificateCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const cleaned = raw.trim().toUpperCase().replace(/[\s-]/g, "");
  return cleaned || null;
}

/** ¿Tiene la forma de un código válido? (longitud y alfabeto). */
export function isValidCertificateCode(raw: unknown): boolean {
  const code = normalizeCertificateCode(raw);
  if (code === null || code.length !== CERTIFICATE_CODE_LENGTH) return false;
  return [...code].every((char) => CODE_ALPHABET.includes(char));
}

export interface CertificateLike {
  code: string;
  holderName: string;
  type: string;
  title: string;
  description?: string | null;
  issuedAt: string;
  status: string;
}

export interface PublicCertificate {
  code: string;
  holderName: string;
  type: string;
  title: string;
  description: string | null;
  issuedAt: string;
}

/**
 * Proyección pública de un certificado. Devuelve `null` si no existe o si está
 * revocado: un certificado revocado **no se publica**.
 */
export function publicCertificate(
  cert: CertificateLike | null | undefined,
): PublicCertificate | null {
  if (!cert || cert.status !== "issued") return null;
  return {
    code: cert.code,
    holderName: cert.holderName,
    type: cert.type,
    title: cert.title,
    description: cert.description?.trim() || null,
    issuedAt: cert.issuedAt,
  };
}

/** Solo se puede revocar lo que está emitido (y no se revoca dos veces). */
export function canRevoke(status: unknown): boolean {
  return status === "issued";
}

export type RevocationCheck =
  | { ok: true; reason: string }
  | { ok: false; message: string };

/** Revocar exige un motivo con contenido: sin él no hay trazabilidad. */
export function validateRevocation(reason: unknown, minLength = 5): RevocationCheck {
  const text = typeof reason === "string" ? reason.trim() : "";
  if (text.length < minLength) {
    return {
      ok: false,
      message: `Indica el motivo de la revocación (al menos ${minLength} caracteres).`,
    };
  }
  return { ok: true, reason: text };
}

/**
 * Normaliza el nombre del titular para comparar: sin distinguir mayúsculas ni
 * espacios repetidos. «María  GÓMEZ» y «maría gómez» son la misma persona.
 */
export function normalizeHolderName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export interface CertificateForDuplicateCheck {
  id: number;
  code: string;
  holderName: string;
  type: string;
  campaignId: number | null;
  status: string;
}

export interface DuplicateCandidate {
  holderName: string;
  type: string;
  campaignId?: number | null;
}

/**
 * Protección contra certificados DUPLICADOS: un mismo titular no debe recibir
 * dos certificados VIGENTES del mismo tipo para la misma campaña. Un certificado
 * revocado no bloquea emitir uno nuevo (el reconocimiento se rehace), y el mismo
 * titular sí puede tener certificados de tipos distintos o de otras campañas.
 */
export function findDuplicateCertificate(
  existing: readonly CertificateForDuplicateCheck[],
  candidate: DuplicateCandidate,
): CertificateForDuplicateCheck | null {
  const name = normalizeHolderName(candidate.holderName);
  const campaignId = candidate.campaignId ?? null;
  return (
    existing.find(
      (cert) =>
        cert.status === "issued" &&
        cert.type === candidate.type &&
        (cert.campaignId ?? null) === campaignId &&
        normalizeHolderName(cert.holderName) === name,
    ) ?? null
  );
}

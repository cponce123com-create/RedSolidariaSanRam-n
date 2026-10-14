import { z } from "zod";
import {
  COLLABORATION_TYPES,
  DEFAULT_COLLABORATION_TYPE,
  DONOR_TYPES,
  collaborationRequiresAmount,
} from "./donor-identity";

/**
 * Validación de negocio del flujo de donación (registro y comprobación).
 *
 * Contratos puros y testeables: el schema reemplaza al de drizzle-zod
 * (`insertDonationSchema`), que solo validaba tipos y permitía montos
 * negativos/0, emails sin formato y métodos de pago arbitrarios vía API.
 */

export const PAYMENT_METHODS = [
  "yape",
  "plin",
  "transfer",
  "card",
  "cash",
  "other",
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/** Monto mínimo en soles exigido SOLO a las colaboraciones de dinero. */
export const MIN_DONATION_AMOUNT = 5;

export const donationInputSchema = z
  .object({
    campaignId: z.number().int().positive().nullish(),
    firstName: z.string().trim().min(2, "El nombre es requerido").max(100),
    lastName: z.string().trim().min(2, "El apellido es requerido").max(100),
    email: z.string().trim().email("Email inválido").max(200),
    phone: z.string().trim().max(30).nullish(),
    // QUÉ aporta el donante. Ausente = dinero (compatibilidad con el flujo
    // anterior, que solo conocía donaciones de dinero).
    collaborationType: z
      .enum(COLLABORATION_TYPES, {
        errorMap: () => ({ message: "Tipo de colaboración inválido" }),
      })
      .default(DEFAULT_COLLABORATION_TYPE),
    // Valor: en dinero es el monto donado; en especie es un estimado que puede
    // ser 0 (o no declararse). El mínimo S/5 se exige en superRefine, solo a
    // dinero; un valor negativo o con más de 2 decimales se rechaza siempre.
    amount: z
      .coerce
      .number()
      .min(0, "El monto no puede ser negativo")
      // Épsilon: 5.01*100 = 500.99999999999994 en float64; una comparación
      // exacta rechazaría montos legítimos con centavos. Diferencia ≥ 0.01
      // (tercer decimal real) queda fuera del margen y se rechaza.
      .refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-8, {
        message: "El monto admite máximo 2 decimales",
      })
      .default(0),
    // Opcional: una donación en especie no tiene método de pago.
    paymentMethod: z
      .enum(PAYMENT_METHODS, {
        errorMap: () => ({ message: "Método de pago inválido" }),
      })
      .nullish(),
    message: z.string().trim().max(1000).nullish(),
    anonymous: z.boolean().nullish(),
    publicProof: z.boolean().nullish(),
    // Tipo de donante declarado en el formulario público (identidad del perfil).
    // Mismos valores que DONOR_TYPES de lib/donor-identity.ts.
    donorType: z.enum(DONOR_TYPES).nullish(),
    receiptNote: z.string().trim().max(200).nullish(),
  })
  .superRefine((data, ctx) => {
    // Solo el dinero exige monto (≥ S/5) y método de pago; una donación en
    // especie (productos, servicios, apoyo logístico) no tiene pago que exigir.
    if (!collaborationRequiresAmount(data.collaborationType)) return;
    if (data.amount < MIN_DONATION_AMOUNT) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["amount"],
        message: "El monto mínimo es S/ 5",
      });
    }
    if (data.paymentMethod == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["paymentMethod"],
        message: "El método de pago es requerido",
      });
    }
  });
// Sin .strict(): los campos extra del body se ignoran. `status` NO está en el
// schema: el servidor lo fija a "pending" al insertar (el cliente no puede
// spoofearlo).

/** Máquina de estados de la donación (integridad del ledger append-only). */
export const STATUS_TRANSITIONS: Record<string, readonly string[]> = {
  pending: ["approved", "rejected"],
  rejected: ["pending"], // reabrir (todavía no se registró en el ledger)
  approved: [], // inmovible: el ingreso ya está encadenado en el ledger
};

export function isAllowedTransition(from: string, to: string): boolean {
  return STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

/** Métodos digitales cuyo comprobante es obligatorio antes de aprobar. */
export const DIGITAL_METHODS = ["yape", "plin", "transfer"] as const;

/**
 * ¿Hace falta comprobante antes de aprobar? Solo para dinero cobrado por un
 * medio digital: sin evidencia no consta que el dinero llegó. Una donación en
 * especie (productos, servicios, apoyo logístico) no tiene pago que comprobar.
 */
export function approvalRequiresProof(
  method: string,
  collaborationType: string = DEFAULT_COLLABORATION_TYPE,
): boolean {
  if (!collaborationRequiresAmount(collaborationType)) return false;
  return (DIGITAL_METHODS as readonly string[]).includes(method);
}

/**
 * URL de comprobante válida: https obligatorio. Con `requireCloudinary` se
 * exige además el host de Cloudinary (única vía legítima del flujo del
 * donante vía firma firmada); los admin pueden pegar URLs https de otros
 * hosts (p. ej. enlaces externos de recibos).
 */
export function isValidProofUrl(
  url: unknown,
  { requireCloudinary = false } = {},
): boolean {
  if (typeof url !== "string" || !url.trim()) return false;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return false;
    return !requireCloudinary || u.hostname === "res.cloudinary.com";
  } catch {
    return false;
  }
}

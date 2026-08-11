import { z } from "zod";

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

export const donationInputSchema = z.object({
  campaignId: z.number().int().positive().nullish(),
  firstName: z.string().trim().min(2, "El nombre es requerido").max(100),
  lastName: z.string().trim().min(2, "El apellido es requerido").max(100),
  email: z.string().trim().email("Email inválido").max(200),
  phone: z.string().trim().max(30).nullish(),
  amount: z
    .coerce
    .number()
    .min(5, "El monto mínimo es S/ 5")
    .refine((v) => Math.round(v * 100) === v * 100, {
      message: "El monto admite máximo 2 decimales",
    }),
  paymentMethod: z.enum(PAYMENT_METHODS, {
    errorMap: () => ({ message: "Método de pago inválido" }),
  }),
  message: z.string().trim().max(1000).nullish(),
  anonymous: z.boolean().nullish(),
  publicProof: z.boolean().nullish(),
  receiptNote: z.string().trim().max(200).nullish(),
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

export function approvalRequiresProof(method: string): boolean {
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

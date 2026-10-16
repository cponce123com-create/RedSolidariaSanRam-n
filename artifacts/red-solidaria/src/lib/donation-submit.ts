/**
 * Envío del formulario público de donación (V20 · Fases 2 y 3).
 *
 * POR QUÉ NO SE USA EL HOOK GENERADO: el contrato de `POST /api/donations` creció
 * con los ítems de producto, el consentimiento de contacto y la clave de
 * idempotencia. Aquí se llama al endpoint directamente y se COMPRUEBA `res.ok`
 * antes de dar nada por bueno: nunca se muestra «¡gracias!» si la API falló.
 */

export type DonationCollaborationType = "dinero" | "productos" | "servicios" | "logistica";

export interface DonationItemPayload {
  product: string;
  productOther?: string;
  quantity: number;
  unit: string;
  description?: string;
  /** Valor estimado OPCIONAL. Nunca se suma al dinero recaudado. */
  estimatedValue?: number;
}

export interface SubmitDonationPayload {
  campaignId?: number | null;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  orgName?: string;
  collaborationType: DonationCollaborationType;
  amount: number;
  paymentMethod?: string;
  message?: string;
  anonymous: boolean;
  /** Autorización para ser contactado (separada de la de publicación). */
  contactConsent: boolean;
  items?: DonationItemPayload[];
  /** Clave de idempotencia: un reintento devuelve la MISMA donación. */
  dedupeToken?: string;
}

export interface SubmittedDonation {
  id: number;
  trackingCode: string | null;
  fulfillmentStatus: string | null;
  status: string;
  amount: number;
  collaborationType: string;
}

/** Error de negocio con el mensaje ya listo para mostrar al donante. */
export class DonationSubmitError extends Error {}

export async function submitDonation(payload: SubmitDonationPayload): Promise<SubmittedDonation> {
  let res: Response;
  try {
    res = await fetch("/api/donations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      credentials: "same-origin",
    });
  } catch {
    // Sin conexión o petición bloqueada (CSP/red): mensaje claro, sin tecnicismos.
    throw new DonationSubmitError(
      "No pudimos conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.",
    );
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new DonationSubmitError(
      body?.message?.trim() ||
        "No pudimos registrar tu donación. Inténtalo de nuevo en unos segundos.",
    );
  }

  return (await res.json()) as SubmittedDonation;
}

/**
 * Clave de idempotencia del formulario. `crypto.randomUUID` no existe en todos
 * los navegadores ni fuera de contextos seguros, así que hay un respaldo con la
 * misma forma (`[A-Za-z0-9_-]`, ≥ 8 caracteres) que acepta el servidor.
 */
export function newDedupeToken(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

import { resolvePublicRecognition, type ConsentMap } from "./donor-consent";

export interface PublicDonorRow {
  id: number;
  firstName: string;
  lastName: string;
  amount: number;
  message: string | null;
  anonymous: boolean;
  publicProof: boolean;
  receiptUrl: string | null;
  createdAt: Date;
  /** Estado vigente de los consentimientos explícitos (puede no haber ninguno). */
  consents?: ConsentMap | null;
}

export interface PublicDonor {
  id: number;
  name: string | null;
  amount: number;
  message: string | null;
  date: string;
  publicProof: boolean;
  proofUrl: string | null;
  /** Autorización para usar fotografías del donante en reconocimientos. */
  photoAllowed: boolean;
}

/**
 * Formatea una donación aprobada para la lista pública de donantes.
 *
 * Reglas de privacidad (Fase 4 · V7.1): la decisión no depende solo de lo
 * declarado al donar, sino también de los consentimientos explícitos y de sus
 * REVOCACIONES. `resolvePublicRecognition` aplica la regla «la negativa gana»:
 *  - name: null si la donación es anónima o si se revocó `public_name`
 *  - proofUrl: solo si el donante autorizó (`publicProof`) y no revocó `public_proof`
 *  - photoAllowed: autorización vigente para fotografías (`public_photo`)
 *  - Nunca se exponen email/phone
 */
export function formatPublicDonor(d: PublicDonorRow): PublicDonor {
  const recognition = resolvePublicRecognition({
    anonymous: d.anonymous,
    publicProof: d.publicProof,
    consents: d.consents ?? null,
  });
  return {
    id: d.id,
    name: recognition.publishName ? `${d.firstName} ${d.lastName}`.trim() : null,
    amount: d.amount,
    message: d.message,
    date: d.createdAt.toISOString(),
    publicProof: recognition.publishProof,
    proofUrl: recognition.publishProof ? d.receiptUrl : null,
    photoAllowed: recognition.publishPhoto,
  };
}

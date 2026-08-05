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
}

export interface PublicDonor {
  id: number;
  name: string | null;
  amount: number;
  message: string | null;
  date: string;
  publicProof: boolean;
  proofUrl: string | null;
}

/**
 * Formatea una donación aprobada para la lista pública de donantes.
 * Reglas de privacidad:
 * - name: null si la donación es anónima
 * - proofUrl: solo se expone si el donante marcó publicProof
 * - Nunca se exponen email/phone
 */
export function formatPublicDonor(d: PublicDonorRow): PublicDonor {
  return {
    id: d.id,
    name: d.anonymous ? null : `${d.firstName} ${d.lastName}`.trim(),
    amount: d.amount,
    message: d.message,
    date: d.createdAt.toISOString(),
    publicProof: d.publicProof,
    proofUrl: d.publicProof ? d.receiptUrl : null,
  };
}

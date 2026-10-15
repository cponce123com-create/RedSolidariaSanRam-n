import type { QueryClient } from "@tanstack/react-query";
import { readErrorMessage } from "@/lib/api-error";
import { invalidateEntities } from "@/lib/query-invalidation";
import type {
  CampaignAnnulmentPreview,
  CampaignVoidResult,
  DonationVoidResult,
} from "@/lib/donation-annulment";

/**
 * Cliente y presentación del panel de DONANTES (Fase 3 del Prompt Maestro).
 *
 * Los datos de donantes son privados: todos los endpoints viven bajo /admin y
 * exigen sesión + rol. Aquí se centralizan las llamadas, las etiquetas de
 * presentación y la invalidación de caché.
 */

export type DonorType = "individual" | "familia" | "empresa" | "organizacion" | "anonimo";

export const DONOR_TYPES: DonorType[] = [
  "individual",
  "familia",
  "empresa",
  "organizacion",
  "anonimo",
];

export const DONOR_TYPE_LABEL: Record<DonorType, string> = {
  individual: "Persona",
  familia: "Familia",
  empresa: "Empresa",
  organizacion: "Organización",
  anonimo: "Anónimo",
};

export function donorTypeLabel(type: string): string {
  return DONOR_TYPE_LABEL[type as DonorType] ?? type;
}

// ─── Tipos de colaboración (espejo de la API) ────────────────────────────────

/**
 * QUÉ aporta el donante. Solo `dinero` implica monto mínimo y comprobante de
 * pago: una donación en especie (productos, servicios, apoyo logístico) se
 * registra con `paymentMethod: "other"` y un valor estimado que puede ser 0.
 * Contrato espejo de `artifacts/api-server/src/lib/donor-identity.ts`.
 */
export const COLLABORATION_TYPES = ["dinero", "productos", "servicios", "logistica"] as const;
export type CollaborationType = (typeof COLLABORATION_TYPES)[number];

export const DEFAULT_COLLABORATION_TYPE: CollaborationType = "dinero";

export function isCollaborationType(value: unknown): value is CollaborationType {
  return (
    typeof value === "string" &&
    (COLLABORATION_TYPES as readonly string[]).includes(value)
  );
}

/**
 * Tipo por defecto. Un valor ausente o desconocido se interpreta como dinero:
 * las donaciones previas al incremento eran dinero y no se reinterpretan.
 */
export function normalizeCollaborationType(value: unknown): CollaborationType {
  return isCollaborationType(value) ? value : DEFAULT_COLLABORATION_TYPE;
}

export const COLLABORATION_TYPE_LABEL: Record<CollaborationType, string> = {
  dinero: "Dinero",
  productos: "Productos",
  servicios: "Servicios",
  logistica: "Apoyo logístico",
};

/** Etiqueta legible del tipo de colaboración; valor desconocido → tal cual. */
export function collaborationTypeLabel(type: string): string {
  return COLLABORATION_TYPE_LABEL[type as CollaborationType] ?? type;
}

/**
 * Solo una colaboración de dinero exige monto mínimo y método de pago.
 * Tolerante con filas antiguas sin el campo: ausente/null se considera dinero.
 */
export function isMoneyCollaboration(type: unknown): boolean {
  return normalizeCollaborationType(type) === "dinero";
}

export const DONATION_STATUS_LABEL: Record<string, string> = {
  pending: "Pendiente",
  approved: "Aprobada",
  rejected: "Rechazada",
  reconciled: "Conciliada",
  annulled: "Anulada",
};

export function donationStatusLabel(status: string): string {
  return DONATION_STATUS_LABEL[status] ?? status;
}

export const DONATION_STATUS_BADGE: Record<string, string> = {
  pending: "bg-yellow-500 hover:bg-yellow-600",
  approved: "bg-accent hover:bg-accent/90",
  rejected: "bg-destructive hover:bg-destructive/90",
  reconciled: "bg-emerald-600 hover:bg-emerald-700",
  // Anulada contablemente: gris, para distinguirla de un rechazo administrativo.
  annulled: "bg-slate-600 hover:bg-slate-700",
};

export function donationStatusBadge(status: string): string {
  return DONATION_STATUS_BADGE[status] ?? "bg-secondary text-foreground";
}

// ─── Tipos de la API ─────────────────────────────────────────────────────────

export interface Donor {
  id: number;
  type: string;
  name: string;
  email: string | null;
  phone: string | null;
  isRecurring: boolean;
  notes: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface DonorWithTotals extends Donor {
  donationCount: number;
  confirmedTotal: number;
}

export interface DonorDonation {
  id: number;
  campaignId: number | null;
  donorId: number | null;
  firstName: string;
  lastName: string;
  amount: number;
  paymentMethod: string;
  /** Tipo de colaboración declarado (la API siempre lo devuelve). */
  collaborationType: string;
  status: string;
  anonymous: boolean;
  createdAt: string | null;
  reconciledAt: string | null;
  reconciledBy: string | null;
}

export interface DonorDetail extends Donor {
  donations: DonorDonation[];
}

export interface DuplicateDonation {
  id: number;
  campaignId: number | null;
  donorId: number | null;
  name: string;
  amount: number;
  paymentMethod: string;
  status: string;
  createdAt: string | null;
}

export interface DuplicateGroup {
  key: string;
  count: number;
  donations: DuplicateDonation[];
}

export interface DonorInput {
  type: DonorType;
  name: string;
  email?: string | null;
  phone?: string | null;
  isRecurring?: boolean;
  notes?: string | null;
}

// ─── Lógica pura ─────────────────────────────────────────────────────────────

export interface DonationTotals {
  count: number;
  /** Suma de donaciones confirmadas (aprobadas o conciliadas). */
  confirmedTotal: number;
}

/** Totales verificables del historial de un donante. Función pura. */
export function summarizeDonations(
  donations: readonly Pick<DonorDonation, "status" | "amount">[] | undefined | null,
): DonationTotals {
  const list = donations ?? [];
  const confirmedTotal = list
    .filter((d) => d.status === "approved" || d.status === "reconciled")
    .reduce((sum, d) => sum + (Number.isFinite(d.amount) ? d.amount : 0), 0);
  return { count: list.length, confirmedTotal };
}

// ─── Llamadas a la API ───────────────────────────────────────────────────────

const JSON_HEADERS = { "Content-Type": "application/json" };

export async function fetchDonors(): Promise<DonorWithTotals[]> {
  const res = await fetch("/api/admin/donors", { credentials: "include" });
  if (!res.ok) throw new Error(await readErrorMessage(res));
  return (await res.json()) as DonorWithTotals[];
}

export async function fetchDonor(id: number): Promise<DonorDetail> {
  const res = await fetch(`/api/admin/donors/${id}`, { credentials: "include" });
  if (!res.ok) throw new Error(await readErrorMessage(res));
  return (await res.json()) as DonorDetail;
}

export async function createDonor(input: DonorInput): Promise<Donor> {
  const res = await fetch("/api/admin/donors", {
    method: "POST",
    headers: JSON_HEADERS,
    credentials: "include",
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(await readErrorMessage(res));
  return (await res.json()) as Donor;
}

export async function updateDonor(id: number, input: DonorInput): Promise<Donor> {
  const res = await fetch(`/api/admin/donors/${id}`, {
    method: "PUT",
    headers: JSON_HEADERS,
    credentials: "include",
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(await readErrorMessage(res));
  return (await res.json()) as Donor;
}

export async function fetchDuplicateGroups(): Promise<DuplicateGroup[]> {
  const res = await fetch("/api/admin/donations/duplicates", { credentials: "include" });
  if (!res.ok) throw new Error(await readErrorMessage(res));
  return (await res.json()) as DuplicateGroup[];
}

/** Marca una donación aprobada como conciliada (operación trazable). */
export async function reconcileDonation(id: number): Promise<void> {
  const res = await fetch(`/api/admin/donations/${id}/reconcile`, {
    method: "PATCH",
    credentials: "include",
  });
  if (!res.ok) throw new Error(await readErrorMessage(res));
}

// ─── Claves de caché e invalidación ──────────────────────────────────────────

export const DONORS_QUERY_KEY = "/api/admin/donors";
export const DUPLICATES_QUERY_KEY = "/api/admin/donations/duplicates";
/** Prefijo de la vista previa de anulación por campaña. */
export const ANNULMENT_QUERY_KEY = "/api/campaigns";

// ─── Anulación contable de donaciones (V7.2.2) ───────────────────────────────

export interface AnnulmentCredentials {
  /** Contraseña actual del superadmin (reautenticación). */
  password: string;
  /** Código TOTP, solo si la cuenta tiene 2FA activo. */
  totpCode?: string;
  /** Motivo obligatorio: queda en la auditoría y en el asiento compensatorio. */
  reason: string;
}

/**
 * Anula contablemente UNA donación. Irreversible sobre las cifras: exige
 * superadmin + reautenticación + motivo. El servidor añade el asiento
 * compensatorio y devuelve el estado del libro para confirmarlo.
 */
export async function voidDonation(
  id: number,
  payload: AnnulmentCredentials,
): Promise<DonationVoidResult> {
  const res = await fetch(`/api/donations/${id}/void`, {
    method: "POST",
    headers: JSON_HEADERS,
    credentials: "include",
    body: JSON.stringify({
      confirm: true,
      reason: payload.reason,
      password: payload.password,
      ...(payload.totpCode ? { totpCode: payload.totpCode } : {}),
    }),
  });
  if (!res.ok) throw new Error(await readErrorMessage(res));
  return (await res.json()) as DonationVoidResult;
}

/** Qué se anularía de una campaña: cuántas, por cuánto y cuáles no se pueden. */
export async function fetchCampaignAnnulmentPreview(
  campaignId: number,
): Promise<CampaignAnnulmentPreview> {
  const res = await fetch(`/api/campaigns/${campaignId}/donations/void/preview`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error(await readErrorMessage(res));
  return (await res.json()) as CampaignAnnulmentPreview;
}

/**
 * Anula EN BLOQUE todas las donaciones confirmadas de una campaña, con un solo
 * motivo. Es la operación para limpiar por completo una campaña de prueba.
 */
export async function voidCampaignDonations(
  campaignId: number,
  payload: AnnulmentCredentials,
): Promise<CampaignVoidResult> {
  const res = await fetch(`/api/campaigns/${campaignId}/donations/void`, {
    method: "POST",
    headers: JSON_HEADERS,
    credentials: "include",
    body: JSON.stringify({
      confirm: true,
      reason: payload.reason,
      password: payload.password,
      ...(payload.totpCode ? { totpCode: payload.totpCode } : {}),
    }),
  });
  if (!res.ok) throw new Error(await readErrorMessage(res));
  return (await res.json()) as CampaignVoidResult;
}

/**
 * Invalida donantes, duplicados y las consultas afectadas por la conciliación
 * (donaciones y campañas, cuyos totales dependen del estado de las donaciones).
 *
 * Las dos últimas usan los predicados de entidad compartidos
 * (`lib/query-keys.ts`): antes comparaban `queryKey[0] === "/api/campaigns"` y
 * no alcanzaban el detalle (`["/api/campaigns/5"]`).
 */
export function invalidateDonorQueries(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({
    predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === DONORS_QUERY_KEY,
  });
  void queryClient.invalidateQueries({ queryKey: [DUPLICATES_QUERY_KEY] });
  invalidateEntities(queryClient, ["donations", "campaigns"]);
}

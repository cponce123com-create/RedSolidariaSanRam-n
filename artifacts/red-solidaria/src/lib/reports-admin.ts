/**
 * Informes descargables (Fase 4 del Prompt Maestro).
 *
 * Enfoque SIN dependencias: los informes se exportan en CSV (se abren directo
 * en Excel/LibreOffice) y el PDF se obtiene imprimiendo el informe en el
 * navegador. Cero peso extra en el bundle y en el despliegue.
 */

export interface ReportDefinition {
  id: string;
  title: string;
  description: string;
  path: string;
}

export const REPORTS: ReportDefinition[] = [
  {
    id: "donations",
    title: "Donaciones",
    description:
      "Todas las donaciones con estado, método de pago, campaña y datos de conciliación bancaria.",
    path: "/api/admin/reports/donations.csv",
  },
  {
    id: "movements",
    title: "Libro contable",
    description:
      "Movimientos de ingreso y gasto con descripción y hash de la cadena de verificación.",
    path: "/api/admin/reports/movements.csv",
  },
];

export interface ReportFilters {
  status?: string;
  campaignId?: number | null;
}

/** Construye la URL de descarga con los filtros activos. Función pura. */
export function buildReportUrl(path: string, filters: ReportFilters = {}): string {
  const params = new URLSearchParams();
  if (filters.status) params.set("status", filters.status);
  if (
    typeof filters.campaignId === "number" &&
    Number.isInteger(filters.campaignId) &&
    filters.campaignId > 0
  ) {
    params.set("campaignId", String(filters.campaignId));
  }
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

export const DONATION_STATUS_FILTERS = [
  { value: "", label: "Todos los estados" },
  { value: "pending", label: "Pendientes" },
  { value: "approved", label: "Aprobadas" },
  { value: "reconciled", label: "Conciliadas" },
  { value: "rejected", label: "Rechazadas" },
] as const;

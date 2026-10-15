import { CAMPAIGN_STATUSES, isCampaignStatus } from "./campaign-lifecycle";

/**
 * Filtros del panel administrativo (Prompt Maestro V7, Fase 6).
 *
 * El dashboard mostraba siempre el acumulado global. Aquí se normalizan los
 * filtros que el panel puede aplicar —campaña, estado de campaña y rango de
 * fechas— para que TODAS las cifras salgan de la misma consulta filtrada y no
 * de mezclas hechas a mano en la interfaz.
 *
 * Semántica (explícita, porque un filtro ambiguo produce cifras que nadie puede
 * conciliar):
 *
 *   - `campaignId`: restringe a UNA campaña. Las donaciones de fondo general
 *     (sin campaña) quedan fuera, porque no pertenecen a ninguna.
 *   - `status`: restringe a las campañas en ese estado. Igual que arriba, el
 *     fondo general queda fuera: no tiene estado de campaña.
 *   - `from` / `to`: restringe por fecha de la donación o del gasto.
 *   - `hasDateRange`: el importe histórico registrado a mano NO se puede
 *     atribuir a un rango de fechas, así que con fechas activas solo se publica
 *     la recaudación verificada (y el histórico deja de contarse).
 *
 * Funciones PURAS y testeables.
 */

export interface DashboardFilters {
  campaignId: number | null;
  status: string | null;
  /** ISO 8601 inclusive. */
  from: string | null;
  /** ISO 8601 inclusive. */
  to: string | null;
  /** Hay algún extremo del rango de fechas. */
  hasDateRange: boolean;
}

export const EMPTY_DASHBOARD_FILTERS: DashboardFilters = {
  campaignId: null,
  status: null,
  from: null,
  to: null,
  hasDateRange: false,
};

function parseSingle(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0].trim() || null;
  return null;
}

type ParsedDate = { ok: true; iso: string } | { ok: false; error: string };

function parseIsoDate(value: string, field: string): ParsedDate {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return { ok: false, error: `${field} no es una fecha válida` };
  }
  return { ok: true, iso: date.toISOString() };
}

export function parseDashboardFilters(
  query: unknown,
): { filters: DashboardFilters } | { error: string } {
  const q = (query ?? {}) as Record<string, unknown>;

  let campaignId: number | null = null;
  const rawCampaignId = parseSingle(q.campaignId);
  if (rawCampaignId !== null) {
    const parsed = Number(rawCampaignId);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      return { error: "campaignId debe ser un identificador de campaña válido" };
    }
    campaignId = parsed;
  }

  let status: string | null = null;
  const rawStatus = parseSingle(q.status);
  if (rawStatus !== null) {
    if (!isCampaignStatus(rawStatus)) {
      return { error: `status inválido. Permitidos: ${CAMPAIGN_STATUSES.join(", ")}` };
    }
    status = rawStatus;
  }

  let from: string | null = null;
  const rawFrom = parseSingle(q.from);
  if (rawFrom !== null) {
    const result = parseIsoDate(rawFrom, "from");
    if (!result.ok) return { error: result.error };
    from = result.iso;
  }

  let to: string | null = null;
  const rawTo = parseSingle(q.to);
  if (rawTo !== null) {
    const result = parseIsoDate(rawTo, "to");
    if (!result.ok) return { error: result.error };
    to = result.iso;
  }

  if (from && to && from > to) {
    return { error: "El rango de fechas está invertido: from es posterior a to" };
  }

  return {
    filters: {
      campaignId,
      status,
      from,
      to,
      hasDateRange: from !== null || to !== null,
    },
  };
}

/**
 * Semántica de fechas del panel (V14-2.1), expuesta en la respuesta.
 *
 * Las cifras de donaciones se filtran por `created_at` (fecha de REGISTRO) y las de
 * gastos por `date` (fecha de la OPERACIÓN). **No es un descuido**: la tabla
 * `donations` no guarda una fecha de operación distinta del registro, así que no hay
 * otro campo que usar. Pero mezclar dos significados sin decirlo produce cifras que
 * nadie puede conciliar, así que se publica junto a los datos y los informes pueden
 * declararlo.
 */
export interface DateSemantics {
  donations: string;
  expenses: string;
  historical: string;
  note: string;
}

export const DASHBOARD_DATE_SEMANTICS: DateSemantics = {
  donations: "created_at — fecha de REGISTRO de la donación",
  expenses: "date — fecha de la OPERACIÓN del gasto",
  historical: "sin fecha — importe histórico registrado a mano",
  note:
    "Donaciones y gastos usan campos distintos por diseño (la donación no guarda una fecha de operación aparte). Con un rango de fechas activo, el histórico NO se cuenta porque no es atribuible a un rango, y las donaciones de fondo general (sin campaña) quedan fuera de los filtros de campaña o estado.",
};

/**
 * Descripción legible de los filtros aplicados, para devolverla con el informe
 * y que un tercero sepa sobre qué se calcularon las cifras.
 */
export function describeDashboardFilters(filters: DashboardFilters): string {
  const parts: string[] = [];
  if (filters.campaignId !== null) parts.push(`campaña #${filters.campaignId}`);
  if (filters.status !== null) parts.push(`estado ${filters.status}`);
  if (filters.from) parts.push(`desde ${filters.from.slice(0, 10)}`);
  if (filters.to) parts.push(`hasta ${filters.to.slice(0, 10)}`);
  return parts.length > 0 ? parts.join(" · ") : "sin filtros (acumulado global)";
}

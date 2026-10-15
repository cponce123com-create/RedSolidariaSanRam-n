import {
  CLASSIFICATION_LABEL,
  classifyDemoData,
  isProtectedCampaign,
  type ClassifiedRecord,
  type DemoClassification,
  type DemoInventory,
  type DemoWorld,
} from "./demo-classification";
import { campaignFunding, roundMoney } from "./funding";

/**
 * Inventario DEMO y CONCILIACIÓN de las cifras del dashboard (V9.1).
 *
 * Dos responsabilidades, ambas PURAS:
 *
 *  1. `buildInventoryReport`: el inventario clasificado (delega en
 *     `demo-classification`).
 *  2. `buildReconciliation`: descompone CADA cifra del panel hasta el registro que
 *     la produce (campaña, id, fecha, estado, tipo, importe y clasificación), para
 *     poder conciliar los importes sin ocultarlos con filtros.
 *
 * La conciliación REPLICA exactamente la regla del dashboard (`campaignFunding`):
 *
 *   · recaudación verificada = suma de donaciones confirmadas (aprobadas o
 *     conciliadas) — las anuladas NO cuentan;
 *   · recaudación histórica = `campaigns.raised` de las campañas SIN donaciones
 *     registradas (así el histórico no se suma dos veces);
 *   · gastos = suma de todos los gastos;
 *   · saldo = recaudación conciliada − gastos.
 *
 * Si la herramienta y el panel discrepasen, el informe lo dice: es la garantía de
 * que no se está «cuadrando» la cifra por la puerta de atrás.
 */

export interface FigureLine {
  kind: "donation" | "expense" | "historical";
  id: number;
  campaignId: number | null;
  campaignTitle: string;
  date: string | null;
  status: string;
  type: string;
  amount: number;
  classification: DemoClassification;
  classificationLabel: string;
  /** ¿Está contada en la cifra del dashboard? */
  counted: boolean;
  reason: string;
}

export interface FigureBreakdown {
  name: string;
  /** Total tal y como lo publica el dashboard. */
  total: number;
  /** Reparto del total por clasificación. */
  byClassification: Record<DemoClassification, number>;
  lines: FigureLine[];
}

export interface CampaignReconciliation {
  id: number;
  title: string;
  status: string;
  isDemo: boolean;
  protected: boolean;
  historicalRaised: number;
  verifiedRaised: number;
  historicalCounted: boolean;
  reconciledRaised: number;
  spent: number;
  net: number;
  classification: DemoClassification;
}

export interface ReconciliationReport {
  generatedAt: string;
  protectedCampaignIds: number[];
  campaigns: CampaignReconciliation[];
  figures: {
    verifiedRaised: FigureBreakdown;
    historicalRaised: FigureBreakdown;
    spent: FigureBreakdown;
  };
  summary: {
    verifiedRaised: number;
    historicalRaised: number;
    historicalCounted: boolean;
    totalRaised: number;
    totalSpent: number;
    balance: number;
    /** Parte de cada cifra que procede de registros DEMO confirmados. */
    demoRaised: number;
    demoSpent: number;
    /** Parte pendiente de clasificar: NO se puede dar por buena ni por falsa. */
    pendingRaised: number;
    pendingSpent: number;
  };
  integrity: {
    /** Donaciones sin campaña (fondo general): cuentan en la cifra global. */
    donationsWithoutCampaign: number;
    donationsWithoutCampaignAmount: number;
    /** Asientos cuyo origen ya no existe. */
    orphanMovements: number;
    /** Gastos cuya campaña no existe (no debería ocurrir: FK NOT NULL). */
    orphanExpenses: number;
  };
}

function emptyByClassification(): Record<DemoClassification, number> {
  return { real: 0, demo: 0, pending: 0, protected: 0 };
}

function toIso(value: Date | string | null | undefined): string | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  if (typeof value === "string" && value.trim()) return value;
  return null;
}

/**
 * Descompone las cifras del dashboard. Puro: recibe la instantánea.
 *
 * @param dashboardStatusFilter si el panel está filtrando por estado de campaña,
 *   el histórico solo cuenta para ese estado (igual que en la ruta del panel).
 */
export function buildReconciliation(
  world: DemoWorld,
  options: { generatedAt?: string; statusFilter?: string | null } = {},
): ReconciliationReport {
  const protectedIds = [...world.protectedCampaignIds];
  const campaignById = new Map(world.campaigns.map((c) => [c.id, c]));
  const titleOf = (id: number | null): string =>
    id === null ? "(sin campaña)" : (campaignById.get(id)?.title ?? `(campaña ${id} inexistente)`);

  const inventory: DemoInventory = classifyDemoData(world);
  const classificationByRecord = new Map<string, ClassifiedRecord>();
  for (const record of inventory.records) {
    classificationByRecord.set(`${record.table}:${record.id}`, record);
  }
  const classificationOf = (
    table: string,
    id: number,
    fallback: DemoClassification,
  ): { classification: DemoClassification; reasons: string[] } => {
    const record = classificationByRecord.get(`${table}:${id}`);
    return record
      ? { classification: record.classification, reasons: record.reasons }
      : { classification: fallback, reasons: ["Sin clasificación registrada."] };
  };

  const statusFilter = options.statusFilter ?? null;
  const statusMatches = (campaignId: number | null): boolean => {
    if (!statusFilter) return true;
    if (campaignId === null) return false; // el fondo general no tiene estado
    return campaignById.get(campaignId)?.status === statusFilter;
  };

  // ─── Donaciones confirmadas (lo que el panel cuenta como recaudado) ────────
  const verifiedLines: FigureLine[] = [];
  const confirmedByCampaign = new Map<number, number>();
  const confirmedCountByCampaign = new Map<number, number>();
  for (const donation of world.donations) {
    const confirmed = donation.status === "approved" || donation.status === "reconciled";
    if (!confirmed) continue;
    if (!statusMatches(donation.campaignId)) continue;
    if (donation.campaignId !== null) {
      confirmedByCampaign.set(
        donation.campaignId,
        roundMoney((confirmedByCampaign.get(donation.campaignId) ?? 0) + donation.amount),
      );
      confirmedCountByCampaign.set(
        donation.campaignId,
        (confirmedCountByCampaign.get(donation.campaignId) ?? 0) + 1,
      );
    }
    const { classification, reasons } = classificationOf("donations", donation.id, "pending");
    verifiedLines.push({
      kind: "donation",
      id: donation.id,
      campaignId: donation.campaignId,
      campaignTitle: titleOf(donation.campaignId),
      date: toIso(donation.createdAt),
      status: donation.status,
      type: "donación",
      amount: roundMoney(donation.amount),
      classification,
      classificationLabel: CLASSIFICATION_LABEL[classification],
      counted: true,
      reason: reasons.join(" "),
    });
  }

  // ─── Histórico: solo campañas SIN donaciones confirmadas ──────────────────
  const historicalLines: FigureLine[] = [];
  for (const campaign of world.campaigns) {
    if (!statusMatches(campaign.id)) continue;
    const raised = roundMoney(campaign.raised ?? 0);
    if (raised <= 0) continue;
    if ((confirmedCountByCampaign.get(campaign.id) ?? 0) > 0) continue;
    const { classification, reasons } = classificationOf("campaigns", campaign.id, "pending");
    historicalLines.push({
      kind: "historical",
      id: campaign.id,
      campaignId: campaign.id,
      campaignTitle: campaign.title,
      date: null,
      status: campaign.status,
      type: "histórico (campaña sin donaciones registradas)",
      amount: raised,
      classification,
      classificationLabel: CLASSIFICATION_LABEL[classification],
      counted: true,
      reason: reasons.join(" "),
    });
  }

  // ─── Gastos ───────────────────────────────────────────────────────────────
  const expenseLines: FigureLine[] = [];
  for (const expense of world.expenses) {
    if (!statusMatches(expense.campaignId)) continue;
    const { classification, reasons } = classificationOf(
      "campaign_expenses",
      expense.id,
      "pending",
    );
    expenseLines.push({
      kind: "expense",
      id: expense.id,
      campaignId: expense.campaignId,
      campaignTitle: titleOf(expense.campaignId),
      date: toIso(expense.date),
      status: "registrado",
      type: expense.description,
      amount: roundMoney(expense.amount),
      classification,
      classificationLabel: CLASSIFICATION_LABEL[classification],
      counted: true,
      reason: reasons.join(" "),
    });
  }

  const sumBy = (lines: FigureLine[]): Record<DemoClassification, number> => {
    const totals = emptyByClassification();
    for (const line of lines) {
      if (!line.counted) continue;
      totals[line.classification] = roundMoney(totals[line.classification] + line.amount);
    }
    return totals;
  };
  const totalOf = (lines: FigureLine[]): number =>
    roundMoney(lines.filter((l) => l.counted).reduce((sum, l) => sum + l.amount, 0));

  const verifiedTotal = totalOf(verifiedLines);
  const historicalTotal = totalOf(historicalLines);
  const spentTotal = totalOf(expenseLines);

  // Misma función que usa el panel: si la herramienta y el panel discrepasen,
  // `funding.totalRaised` lo delataría al compararlo con `verifiedTotal`.
  const funding = campaignFunding(historicalTotal, verifiedTotal);
  const balance = roundMoney(funding.reconciledRaised - spentTotal);

  const verifiedBy = sumBy(verifiedLines);
  const historicalBy = sumBy(historicalLines);
  const spentBy = sumBy(expenseLines);

  const campaigns: CampaignReconciliation[] = world.campaigns.map((campaign) => {
    const verifiedRaised = confirmedByCampaign.get(campaign.id) ?? 0;
    const historicalRaised = roundMoney(campaign.raised ?? 0);
    const hasConfirmed = (confirmedCountByCampaign.get(campaign.id) ?? 0) > 0;
    const campaignFundingValue = campaignFunding(hasConfirmed ? historicalRaised : 0, verifiedRaised);
    const spent = roundMoney(
      world.expenses
        .filter((expense) => expense.campaignId === campaign.id)
        .reduce((sum, expense) => sum + expense.amount, 0),
    );
    const { classification } = classificationOf("campaigns", campaign.id, "pending");
    return {
      id: campaign.id,
      title: campaign.title,
      status: campaign.status,
      isDemo: campaign.isDemo === true,
      protected: isProtectedCampaign(campaign.id, protectedIds),
      historicalRaised,
      verifiedRaised,
      historicalCounted: campaignFundingValue.historicalCounted,
      reconciledRaised: campaignFundingValue.reconciledRaised,
      spent,
      net: roundMoney(campaignFundingValue.reconciledRaised - spent),
      classification,
    };
  });

  // ─── Integridad ───────────────────────────────────────────────────────────
  const donationsWithoutCampaign = world.donations.filter((d) => d.campaignId === null);
  const donationById = new Set(world.donations.map((d) => d.id));
  const expenseIds = new Set(world.expenses.map((e) => e.id));
  const campaignIds = new Set(world.campaigns.map((c) => c.id));
  const orphanMovements = world.movements.filter((movement) => {
    if (movement.sourceType === "donation") return !donationById.has(movement.sourceId);
    if (movement.sourceType === "expense") return !expenseIds.has(movement.sourceId);
    if (movement.sourceType === "donation_reversal") return !donationById.has(movement.sourceId);
    return true;
  }).length;

  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    protectedCampaignIds: protectedIds,
    campaigns,
    figures: {
      verifiedRaised: {
        name: "Recaudación verificada (donaciones confirmadas)",
        total: verifiedTotal,
        byClassification: verifiedBy,
        lines: verifiedLines,
      },
      historicalRaised: {
        name: "Recaudación histórica contada (campañas sin donaciones registradas)",
        total: historicalTotal,
        byClassification: historicalBy,
        lines: historicalLines,
      },
      spent: {
        name: "Gastos registrados",
        total: spentTotal,
        byClassification: spentBy,
        lines: expenseLines,
      },
    },
    summary: {
      verifiedRaised: funding.verifiedRaised,
      historicalRaised: funding.historicalRaised,
      historicalCounted: funding.historicalCounted,
      totalRaised: funding.reconciledRaised,
      totalSpent: spentTotal,
      balance,
      demoRaised: roundMoney(verifiedBy.demo + historicalBy.demo),
      demoSpent: spentBy.demo,
      pendingRaised: roundMoney(verifiedBy.pending + historicalBy.pending),
      pendingSpent: spentBy.pending,
    },
    integrity: {
      donationsWithoutCampaign: donationsWithoutCampaign.length,
      donationsWithoutCampaignAmount: roundMoney(
        donationsWithoutCampaign.reduce((sum, d) => sum + d.amount, 0),
      ),
      orphanMovements,
      orphanExpenses: world.expenses.filter((e) => !campaignIds.has(e.campaignId)).length,
    },
  };
}

/** Filas planas de la conciliación, listas para el CSV descargable. */
export interface ReconciliationCsvRow {
  figura: string;
  campana: string;
  campanaId: string;
  tipo: string;
  referencia: string;
  fecha: string;
  estado: string;
  importe: number;
  clasificacion: string;
  evidencia: string;
}

/** Aplana el informe a filas de CSV (una por importe conciliado). */
export function reconciliationCsvRows(report: ReconciliationReport): ReconciliationCsvRow[] {
  const rows: ReconciliationCsvRow[] = [];
  const figures: [string, FigureBreakdown][] = [
    ["Recaudación verificada", report.figures.verifiedRaised],
    ["Recaudación histórica contada", report.figures.historicalRaised],
    ["Gastos registrados", report.figures.spent],
  ];
  for (const [figureName, breakdown] of figures) {
    for (const line of breakdown.lines) {
      rows.push({
        figura: figureName,
        campana: line.campaignTitle,
        campanaId: line.campaignId === null ? "" : String(line.campaignId),
        tipo: line.kind === "donation" ? "Donación" : line.kind === "expense" ? "Gasto" : "Histórico",
        referencia: `#${line.id}`,
        fecha: line.date ?? "",
        estado: line.status,
        importe: line.amount,
        clasificacion: line.classificationLabel,
        evidencia: line.reason,
      });
    }
  }
  // Fila de cierre: el saldo publicado y su fórmula, para que el CSV cuadre solo.
  rows.push({
    figura: "SALDO PUBLICADO",
    campana: "",
    campanaId: "",
    tipo: "Saldo",
    referencia: "",
    fecha: report.generatedAt.slice(0, 10),
    estado: report.summary.historicalCounted ? "con histórico contado" : "solo verificado",
    importe: report.summary.balance,
    clasificacion: "",
    evidencia: `recaudación ${report.summary.totalRaised} − gastos ${report.summary.totalSpent}`,
  });
  return rows;
}

/**
 * Cifras de cabecera del informe. Se separan para poder compararlas con el
 * dashboard en las pruebas sin recorrer todas las líneas.
 */
export function reconciliationHeadline(report: ReconciliationReport): {
  totalRaised: number;
  totalSpent: number;
  balance: number;
  demoShare: number;
} {
  const total = report.summary.totalRaised + report.summary.totalSpent;
  const demo = report.summary.demoRaised + report.summary.demoSpent;
  return {
    totalRaised: report.summary.totalRaised,
    totalSpent: report.summary.totalSpent,
    balance: report.summary.balance,
    demoShare: total > 0 ? Math.round((demo / total) * 1000) / 10 : 0,
  };
}

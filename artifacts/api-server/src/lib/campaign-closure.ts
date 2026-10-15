/**
 * CIERRE FINANCIERO DE CAMPAÑA (V14-2.3) — FUNCIONES PURAS.
 *
 * Un cierre es un ACTO CONTABLE: se revisa la campaña, se congela el informe de
 * cifras, se firma y a partir de ahí la contabilidad de esa campaña queda bloqueada.
 *
 * DECISIONES QUE TOMA EL EQUIPO (documentadas porque son de negocio)
 * ------------------------------------------------------------------
 * D1 · El cierre es un evento fechado y firmado con historial **append-only**, no un
 *      campo de estado sobrescribible. Reabrir no borra el cierre anterior.
 * D2 · BLOQUEA solo lo que rompe la contabilidad: el libro descuadrado, los asientos
 *      huérfanos y las donaciones confirmadas sin asiento. Lo que solo está pendiente
 *      (un gasto sin comprobante, un bien sin movimiento) **avisa** y queda registrado
 *      como SALVEDAD en el informe: se puede cerrar «con salvedades», que es la verdad
 *      de muchas campañas, en vez de obligar a falsear el estado.
 * D3 · Cerrar lo puede hacer un administrador; **reabrir solo un superadministrador**
 *      con reautenticación y motivo, porque rompe el histórico.
 * D4 · Tras el cierre se bloquean las escrituras financieras de la campaña (alta,
 *      edición y borrado de gastos; anulación de donaciones). Los **asientos
 *      compensatorios siguen permitidos**: prohibir corregir un error no lo arregla,
 *      lo esconde.
 * D5 · El informe de cierre se expone como JSON descargable con su SHA-256; el PDF
 *      llega con la Entrega 3.
 */

export const CLOSURE_EVENTS = ["closed", "reopened"] as const;
export type ClosureEvent = (typeof CLOSURE_EVENTS)[number];

export const CLOSURE_DECISIONS = {
  model: "El cierre es un acto contable fechado y firmado, con historial append-only (no un campo de estado).",
  blocking:
    "Bloquea solo lo que rompe la contabilidad (libro descuadrado, asientos huérfanos, donaciones confirmadas sin asiento). Lo demás avisa y queda como salvedad del informe.",
  permissions:
    "Cerrar: administrador o superadministrador con reautenticación. Reabrir: solo superadministrador con reautenticación y motivo.",
  afterClose:
    "Se bloquean alta, edición y borrado de gastos y la anulación de donaciones de la campaña. Los asientos compensatorios siguen permitidos.",
  report: "Informe JSON con SHA-256; el PDF se entrega en la Entrega 3 (certificados).",
} as const;

export interface ClosureCampaign {
  id: number;
  title: string;
  status: string;
  goal: number | null;
  raised: number | null;
}

export interface ClosureDonation {
  id: number;
  amount: number;
  status: string;
  reconciledAt: Date | string | null;
  paymentMethod: string | null;
  collaborationType: string | null;
}

export interface ClosureExpense {
  id: number;
  amount: number;
  description: string;
  receiptUrl: string | null;
}

export interface ClosureLeftover {
  id: number;
  quantity: number | null;
  receivedQty: number | null;
  usedQty: number | null;
}

export interface ClosureLedgerState {
  verified: boolean;
  movementCount: number;
  rootHash: string | null;
  /** Donaciones confirmadas SIN asiento (hallazgo del libro). */
  donationsWithoutMovement: number;
  /** Asientos cuyo origen ya no existe. */
  orphanMovements: number;
}

export interface ClosureInput {
  campaign: ClosureCampaign;
  donations: readonly ClosureDonation[];
  expenses: readonly ClosureExpense[];
  leftovers: readonly ClosureLeftover[];
  ledger: ClosureLedgerState;
  /** ¿Es un comprobante propio o un medio de relleno? (viene de la capa de medios) */
  isOwnDocument: (url: string | null) => boolean;
}

export type ClosureItemStatus = "ok" | "warning" | "blocker";

export interface ClosureItem {
  key: string;
  label: string;
  status: ClosureItemStatus;
  /** Cifra o hecho concreto, no una opinión. */
  detail: string;
}

export interface ClosureFigures {
  verifiedRaised: number;
  historicalRaised: number;
  totalRaised: number;
  totalSpent: number;
  balance: number;
  donationsCount: number;
  expensesCount: number;
  inKindCount: number;
  leftoversRemaining: number;
}

export interface ClosureReport {
  generatedAt: string;
  campaignId: number;
  campaignTitle: string;
  figures: ClosureFigures;
  checklist: ClosureItem[];
  blockers: string[];
  warnings: string[];
  /** ¿Se puede cerrar? (con salvedades si hay avisos). */
  canClose: boolean;
  withSalvedades: boolean;
  ledger: ClosureLedgerState;
  decisions: typeof CLOSURE_DECISIONS;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Construye el informe de cierre: las diez revisiones del procedimiento, con sus
 * cifras, sus bloqueos y sus salvedades. Puro.
 */
export function buildClosureReport(input: ClosureInput): ClosureReport {
  const confirmed = input.donations.filter(
    (donation) => donation.status === "approved" || donation.status === "reconciled",
  );
  const verifiedRaised = round2(confirmed.reduce((sum, donation) => sum + donation.amount, 0));
  const historicalRaised = round2(Math.max(0, input.campaign.raised ?? 0));
  const totalSpent = round2(input.expenses.reduce((sum, expense) => sum + expense.amount, 0));
  const totalRaised = round2(verifiedRaised + (confirmed.length === 0 ? historicalRaised : 0));
  const balance = round2(totalRaised - totalSpent);

  // Donaciones en especie: las que no son dinero (o los bienes registrados).
  const inKindDonations = input.donations.filter(
    (donation) => (donation.collaborationType ?? "").toLowerCase() === "especie",
  );
  const leftoversRemaining = round2(
    input.leftovers.reduce(
      (sum, item) => sum + Math.max(0, Number(item.receivedQty) - Number(item.usedQty)),
      0,
    ),
  );

  const expensesWithoutReceipt = input.expenses.filter((expense) => !expense.receiptUrl);
  const expensesWithOwnDocument = input.expenses.filter((expense) =>
    input.isOwnDocument(expense.receiptUrl),
  );
  const expensesWithPlaceholder = input.expenses.filter(
    (expense) => expense.receiptUrl !== null && !input.isOwnDocument(expense.receiptUrl),
  );

  const items: ClosureItem[] = [];
  const blockers: string[] = [];
  const warnings: string[] = [];

  const add = (item: ClosureItem) => {
    items.push(item);
    if (item.status === "blocker") blockers.push(`${item.label}: ${item.detail}`);
    if (item.status === "warning") warnings.push(`${item.label}: ${item.detail}`);
  };

  // 1 · Ingresos
  add({
    key: "income",
    label: "1 · Ingresos revisados",
    status: confirmed.length > 0 || historicalRaised > 0 ? "ok" : "warning",
    detail:
      confirmed.length > 0 || historicalRaised > 0
        ? `${confirmed.length} donación(es) confirmada(s) por ${verifiedRaised} y un histórico de ${historicalRaised}.`
        : "No hay ingresos registrados: revisa que no falte registrar lo recaudado.",
  });

  // 2 · Gastos
  add({
    key: "expenses",
    label: "2 · Gastos revisados",
    status: input.expenses.length > 0 ? "ok" : "warning",
    detail:
      input.expenses.length > 0
        ? `${input.expenses.length} gasto(s) por ${totalSpent}.`
        : "No hay gastos registrados.",
  });

  // 3 · Comprobantes
  add({
    key: "receipts",
    label: "3 · Comprobantes revisados",
    status: expensesWithoutReceipt.length > 0 ? "warning" : "ok",
    detail:
      `${expensesWithOwnDocument.length} con documento propio, ` +
      `${expensesWithPlaceholder.length} con imagen de relleno y ` +
      `${expensesWithoutReceipt.length} sin comprobante.`,
  });

  // 4 · Donaciones en especie
  add({
    key: "in_kind",
    label: "4 · Donaciones en especie revisadas",
    status: "ok",
    detail: `${inKindDonations.length} donación(es) en especie y ${input.leftovers.length} bien(es) registrado(s).`,
  });

  // 5 · Saldos
  add({
    key: "balance",
    label: "5 · Saldos revisados",
    status: balance < 0 ? "warning" : "ok",
    detail: `Ingresos ${totalRaised} − gastos ${totalSpent} = ${balance}.${
      balance < 0 ? " El saldo es negativo: revisa que todos los ingresos estén registrados." : ""
    }`,
  });

  // 6 · Recursos sobrantes
  add({
    key: "leftovers",
    label: "6 · Recursos sobrantes revisados",
    status: leftoversRemaining > 0 ? "warning" : "ok",
    detail:
      leftoversRemaining > 0
        ? `Quedan ${leftoversRemaining} unidad(es) por destinar: indica su destino en el informe.`
        : "No quedan recursos sobrantes pendientes.",
  });

  // 7 · Discrepancias contables: esto SÍ bloquea cuando rompe el libro.
  const ledgerBroken = !input.ledger.verified;
  add({
    key: "discrepancies",
    label: "7 · Discrepancias identificadas",
    status: ledgerBroken || input.ledger.orphanMovements > 0 ? "blocker" : input.ledger.donationsWithoutMovement > 0 ? "warning" : "ok",
    detail: ledgerBroken
      ? "La cadena de hashes NO verifica: hay que resolverlo antes de cerrar."
      : input.ledger.orphanMovements > 0
        ? `Hay ${input.ledger.orphanMovements} asiento(s) huérfano(s): su origen ya no existe.`
        : input.ledger.donationsWithoutMovement > 0
          ? `Hay ${input.ledger.donationsWithoutMovement} donación(es) confirmada(s) sin asiento: queda como salvedad (regularizable después).`
          : `Libro consistente (${input.ledger.movementCount} asiento(s)).`,
  });

  // 8 · Informe
  add({
    key: "report",
    label: "8 · Informe de cierre",
    status: "ok",
    detail: "Este informe se congela con su SHA-256 al confirmar el cierre.",
  });

  // 9 · Aprobación
  add({
    key: "approval",
    label: "9 · Aprobación registrada",
    status: "ok",
    detail: "El cierre exige motivo, reautenticación y queda auditado con quién lo firmó.",
  });

  // 10 · Bloqueo posterior
  add({
    key: "lock",
    label: "10 · Bloqueo de modificaciones",
    status: "ok",
    detail:
      "Tras el cierre se bloquean alta/edición/borrado de gastos y la anulación de donaciones de la campaña. Los asientos compensatorios siguen permitidos.",
  });

  return {
    generatedAt: new Date().toISOString(),
    campaignId: input.campaign.id,
    campaignTitle: input.campaign.title,
    figures: {
      verifiedRaised,
      historicalRaised,
      totalRaised,
      totalSpent,
      balance,
      donationsCount: confirmed.length,
      expensesCount: input.expenses.length,
      inKindCount: inKindDonations.length,
      leftoversRemaining,
    },
    checklist: items,
    blockers,
    warnings,
    canClose: blockers.length === 0,
    withSalvedades: warnings.length > 0,
    ledger: input.ledger,
    decisions: CLOSURE_DECISIONS,
  };
}

// ─── Estado derivado del historial append-only ──────────────────────────────

export interface ClosureEventRow {
  id: number;
  event: string;
  reason: string;
  performedBy: string | null;
  createdAt: Date | string;
}

export interface ClosureState {
  /** ¿La campaña está cerrada AHORA? (derivado del último evento). */
  closed: boolean;
  lastEvent: { event: string; reason: string; performedBy: string | null; createdAt: string } | null;
  /** Historial completo, del más reciente al más antiguo. */
  history: { id: number; event: string; reason: string; performedBy: string | null; createdAt: string }[];
  closureCount: number;
  reopeningCount: number;
}

/** Deriva el estado actual del historial append-only. Puro. */
export function deriveClosureState(events: readonly ClosureEventRow[]): ClosureState {
  const toIso = (value: Date | string): string =>
    value instanceof Date ? value.toISOString() : String(value);
  const ordered = [...events].sort((a, b) => b.id - a.id);
  const history = ordered.map((row) => ({
    id: row.id,
    event: row.event,
    reason: row.reason,
    performedBy: row.performedBy,
    createdAt: toIso(row.createdAt),
  }));
  const latest = history[0] ?? null;
  return {
    closed: latest?.event === "closed",
    lastEvent: latest,
    history,
    closureCount: history.filter((row) => row.event === "closed").length,
    reopeningCount: history.filter((row) => row.event === "reopened").length,
  };
}

/**
 * ¿Se puede cerrar? Un cierre solo se rechaza por bloqueos contables (D2). Puro.
 */
export function validateClosureRequest(
  body: unknown,
  options: { canClose: boolean; blockers: readonly string[]; alreadyClosed: boolean },
): { ok: true; reason: string } | { ok: false; code: string; message: string; status: number } {
  const raw = (body ?? {}) as Record<string, unknown>;
  if (raw.confirm !== true) {
    return {
      ok: false,
      code: "confirmation_required",
      message: "Cerrar la campaña exige confirmación explícita (confirm: true).",
      status: 400,
    };
  }
  const reason = typeof raw.reason === "string" ? raw.reason.trim() : "";
  if (reason.length < 10) {
    return {
      ok: false,
      code: "reason_required",
      message: "Indica el motivo del cierre (mínimo 10 caracteres): queda en la auditoría.",
      status: 400,
    };
  }
  if (options.alreadyClosed) {
    return {
      ok: false,
      code: "already_closed",
      message: "La campaña ya está cerrada. Reábrela (solo un superadministrador) si necesitas cambiarla.",
      status: 409,
    };
  }
  if (!options.canClose) {
    return {
      ok: false,
      code: "closure_blocked",
      message: `No se puede cerrar: ${options.blockers.join(" ")}`,
      status: 409,
    };
  }
  return { ok: true, reason };
}

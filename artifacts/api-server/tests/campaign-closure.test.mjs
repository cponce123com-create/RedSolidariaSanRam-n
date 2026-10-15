// Cierre financiero de campaña (V14-2.3) — lógica PURA.
//
// Regresión que blindan: un cierre es un ACTO CONTABLE (evento firmado, historial
// append-only), bloquea solo lo que rompe la contabilidad y permite cerrar «con
// salvedades» dejando constancia, en vez de obligar a falsear el estado.
import { test } from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL ??= "postgres://localhost:5432/nonexistent";

const { buildClosureReport, deriveClosureState, validateClosureRequest } = await import(
  "./dist/lib/campaign-closure.mjs"
);

const CAMPAIGN = { id: 7, title: "Campaña de prueba", status: "active", goal: 1000, raised: 0 };
const OWN = "https://res.cloudinary.com/redsolidaria/image/upload/v1/boleta.jpg";
const PLACEHOLDER = "https://images.unsplash.com/photo-1?w=600";

const donation = (id, amount, status = "approved") => ({
  id,
  amount,
  status,
  reconciledAt: null,
  paymentMethod: "transfer",
  collaborationType: "dinero",
});

const expense = (id, amount, receiptUrl = null) => ({
  id,
  amount,
  description: `gasto ${id}`,
  receiptUrl,
});

const baseInput = (overrides = {}) => ({
  campaign: CAMPAIGN,
  donations: [],
  expenses: [],
  leftovers: [],
  ledger: { verified: true, movementCount: 0, rootHash: null, donationsWithoutMovement: 0, orphanMovements: 0 },
  isOwnDocument: (url) => typeof url === "string" && url.includes("res.cloudinary.com/redsolidaria"),
  ...overrides,
});

// ─── Informe y cifras ────────────────────────────────────────────────────────

test("el informe cubre las DIEZ revisiones del procedimiento", () => {
  const report = buildClosureReport(baseInput({ donations: [donation(1, 1000)], expenses: [expense(1, 400, OWN)] }));
  assert.equal(report.checklist.length, 10);
  const keys = report.checklist.map((item) => item.key);
  for (const expected of ["income", "expenses", "receipts", "in_kind", "balance", "leftovers", "discrepancies", "report", "approval", "lock"]) {
    assert.ok(keys.includes(expected), expected);
  }
});

test("las cifras del cierre son las confirmadas menos los gastos", () => {
  const report = buildClosureReport(
    baseInput({
      donations: [donation(1, 1000), donation(2, 500, "reconciled"), donation(3, 999, "pending")],
      expenses: [expense(1, 400), expense(2, 100)],
    }),
  );
  assert.equal(report.figures.verifiedRaised, 1500, "la pendiente no cuenta");
  assert.equal(report.figures.totalSpent, 500);
  assert.equal(report.figures.balance, 1000);
  assert.equal(report.figures.donationsCount, 2);
  assert.equal(report.figures.expensesCount, 2);
});

test("sin donaciones registradas se usa el histórico, y no se suma dos veces", () => {
  const onlyHistorical = buildClosureReport(baseInput({ campaign: { ...CAMPAIGN, raised: 2818.5 } }));
  assert.equal(onlyHistorical.figures.totalRaised, 2818.5);

  const withDonations = buildClosureReport(
    baseInput({ campaign: { ...CAMPAIGN, raised: 2818.5 }, donations: [donation(1, 100)] }),
  );
  assert.equal(withDonations.figures.totalRaised, 100, "con donaciones, el histórico no se cuenta");
});

// ─── Bloqueos y salvedades ───────────────────────────────────────────────────

test("un libro descuadrado BLOQUEA el cierre", () => {
  const report = buildClosureReport(
    baseInput({ ledger: { verified: false, movementCount: 2, rootHash: null, donationsWithoutMovement: 0, orphanMovements: 0 } }),
  );
  assert.equal(report.canClose, false);
  assert.equal(report.blockers.length, 1);
  assert.match(report.blockers[0], /cadena de hashes NO verifica/);
});

test("un asiento huérfano BLOQUEA el cierre", () => {
  const report = buildClosureReport(
    baseInput({ ledger: { verified: true, movementCount: 2, rootHash: "x", donationsWithoutMovement: 0, orphanMovements: 1 } }),
  );
  assert.equal(report.canClose, false);
  assert.match(report.blockers[0], /huérfano/);
});

test("una donación sin asiento AVISA y queda como salvedad (se puede cerrar)", () => {
  const report = buildClosureReport(
    baseInput({
      donations: [donation(1, 100)],
      ledger: { verified: true, movementCount: 0, rootHash: null, donationsWithoutMovement: 1, orphanMovements: 0 },
    }),
  );
  assert.equal(report.canClose, true, "no rompe el libro: es regularizable después");
  assert.equal(report.withSalvedades, true);
  assert.match(report.warnings.join(" "), /sin asiento/);
});

test("un gasto sin comprobante avisa pero no impide cerrar", () => {
  const report = buildClosureReport(baseInput({ expenses: [expense(1, 100)] }));
  assert.equal(report.canClose, true);
  assert.match(report.checklist.find((item) => item.key === "receipts")?.detail ?? "", /sin comprobante/);
  assert.equal(report.checklist.find((item) => item.key === "receipts")?.status, "warning");
});

test("distingue comprobante propio de imagen de relleno", () => {
  const report = buildClosureReport(
    baseInput({ expenses: [expense(1, 100, OWN), expense(2, 200, PLACEHOLDER), expense(3, 300)] }),
  );
  const detail = report.checklist.find((item) => item.key === "receipts")?.detail ?? "";
  assert.match(detail, /1 con documento propio/);
  assert.match(detail, /1 con imagen de relleno/);
  assert.match(detail, /1 sin comprobante/);
});

test("un saldo negativo avisa (revisa que no falte registrar ingresos)", () => {
  const report = buildClosureReport(baseInput({ expenses: [expense(1, 500)] }));
  assert.equal(report.checklist.find((item) => item.key === "balance")?.status, "warning");
  assert.equal(report.canClose, true);
});

test("los recursos sobrantes avisan hasta que se indique su destino", () => {
  const report = buildClosureReport(
    baseInput({ leftovers: [{ id: 1, quantity: 10, receivedQty: 10, usedQty: 4 }] }),
  );
  assert.equal(report.figures.leftoversRemaining, 6);
  assert.match(report.checklist.find((item) => item.key === "leftovers")?.detail ?? "", /6 unidad/);
});

test("las donaciones en especie se cuentan aparte", () => {
  const report = buildClosureReport(
    baseInput({
      donations: [donation(1, 0), { ...donation(2, 0), collaborationType: "especie" }],
    }),
  );
  assert.equal(report.figures.inKindCount, 1);
});

// ─── Estado derivado del historial append-only ───────────────────────────────

test("el estado sale del ÚLTIMO evento: cerrar, reabrir y volver a cerrar", () => {
  const closed = deriveClosureState([
    { id: 1, event: "closed", reason: "cierre inicial", performedBy: "ana", createdAt: new Date("2026-01-10") },
  ]);
  assert.equal(closed.closed, true);
  assert.equal(closed.closureCount, 1);
  assert.equal(closed.reopeningCount, 0);

  const reopened = deriveClosureState([
    { id: 1, event: "closed", reason: "cierre inicial", performedBy: "ana", createdAt: new Date("2026-01-10") },
    { id: 2, event: "reopened", reason: "faltó una boleta", performedBy: "luis", createdAt: new Date("2026-01-12") },
  ]);
  assert.equal(reopened.closed, false, "reabrir no borra el cierre: lo desactiva");
  assert.equal(reopened.closureCount, 1);
  assert.equal(reopened.reopeningCount, 1);
  assert.equal(reopened.history[0].event, "reopened", "el historial va del más nuevo al más viejo");
  assert.equal(reopened.history.length, 2, "se conserva el cierre anterior como prueba");
});

test("sin eventos la campaña está abierta y el historial vacío", () => {
  const state = deriveClosureState([]);
  assert.equal(state.closed, false);
  assert.equal(state.lastEvent, null);
  assert.deepEqual(state.history, []);
});

// ─── Validación de la petición ───────────────────────────────────────────────

test("cerrar exige confirmación y motivo", () => {
  const opts = { canClose: true, blockers: [], alreadyClosed: false };
  assert.equal(validateClosureRequest({ reason: "motivo suficiente" }, opts).code, "confirmation_required");
  assert.equal(
    validateClosureRequest({ confirm: true, reason: "corto" }, opts).code,
    "reason_required",
  );
  const ok = validateClosureRequest({ confirm: true, reason: "Cierre del ejercicio 2026" }, opts);
  assert.equal(ok.ok, true);
  assert.equal(ok.reason, "Cierre del ejercicio 2026");
});

test("no se puede cerrar dos veces ni con bloqueos contables", () => {
  const already = validateClosureRequest(
    { confirm: true, reason: "Cierre del ejercicio 2026" },
    { canClose: true, blockers: [], alreadyClosed: true },
  );
  assert.equal(already.ok, false);
  assert.equal(already.code, "already_closed");
  assert.equal(already.status, 409);

  const blocked = validateClosureRequest(
    { confirm: true, reason: "Cierre del ejercicio 2026" },
    { canClose: false, blockers: ["7 · Discrepancias: la cadena no verifica"], alreadyClosed: false },
  );
  assert.equal(blocked.ok, false);
  assert.equal(blocked.code, "closure_blocked");
  assert.match(blocked.message, /no verifica/);
});

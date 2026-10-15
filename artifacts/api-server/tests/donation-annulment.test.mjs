// Anulación contable de donaciones (V7.2.2) — lógica PURA y prueba contable.
//
// Regresión cubierta: una donación confirmada no se puede borrar (dejaría su
// asiento huérfano y rompería la cadena), así que se ANULA con un asiento
// compensatorio. Estas pruebas fijan que, tras anular, el informe de integridad
// sigue cuadrando: es la garantía de que el libro no queda descuadrado.
import { test } from "node:test";
import assert from "node:assert/strict";

const {
  MIN_ANNUL_REASON,
  annulBlockReason,
  annulReversalDescription,
  canAnnull,
  isAnnulledDonation,
} = await import("./dist/lib/donor-identity.mjs");

const {
  analyzeAnnulment,
  planCampaignAnnulment,
  validateAnnulmentRequest,
} = await import("./dist/lib/donation-annulment.mjs");

const { auditLedger } = await import("./dist/lib/ledger-audit.mjs");

const OK_CHAIN = { verified: true, brokenAt: null, rootHash: "r", count: 2 };

const donation = (overrides = {}) => ({
  id: 16,
  campaignId: 3,
  firstName: "Demo",
  lastName: "Ficticia",
  email: "demo@example.com",
  amount: 60,
  status: "approved",
  reconciledAt: null,
  ...overrides,
});

// ─── Qué se puede anular y qué no ────────────────────────────────────────────

test("solo se anula lo CONFIRMADO: una donación encadenada en el libro", () => {
  assert.equal(canAnnull("approved"), true);
  assert.equal(canAnnull("reconciled"), true);
  assert.equal(canAnnull("pending"), false);
  assert.equal(canAnnull("rejected"), false);
  assert.equal(canAnnull("annulled"), false);
});

test("annulBlockReason explica por qué no se puede y qué hacer en su lugar", () => {
  assert.equal(annulBlockReason("approved"), null);
  assert.equal(annulBlockReason("reconciled"), null);

  const pending = annulBlockReason("pending");
  assert.match(pending, /confirmadas/);
  assert.match(pending, /recházala con la acción normal/);

  const rejected = annulBlockReason("rejected");
  assert.match(rejected, /rechazada/);

  assert.match(annulBlockReason("annulled"), /ya está anulada/);
});

test("isAnnulledDonation reconoce el estado de anulación", () => {
  assert.equal(isAnnulledDonation("annulled"), true);
  assert.equal(isAnnulledDonation("approved"), false);
  assert.equal(isAnnulledDonation(""), false);
});

// ─── Descripción del asiento compensatorio ───────────────────────────────────

test("la descripción del reverso es determinista y cita la donación y el motivo", () => {
  const text = annulReversalDescription(16, "  Datos   de prueba  ");
  assert.equal(text, "Anulación contable de la donación #16 — Datos de prueba");
  // El hash del asiento cubre la descripción: dos llamadas deben coincidir.
  assert.equal(text, annulReversalDescription(16, "Datos de prueba"));
});

// ─── Veredicto individual ────────────────────────────────────────────────────

test("una donación aprobada con asiento se anula y añade el reverso", () => {
  const verdict = analyzeAnnulment({ donation: donation(), hasMovement: true });
  assert.equal(verdict.allowed, true);
  assert.deepEqual(verdict.blockers, []);
  assert.deepEqual(verdict.impact, {
    donationId: 16,
    amount: 60,
    campaignId: 3,
    reversal: true,
    reconciled: false,
  });
});

test("una donación pendiente no se anula (no tiene asiento)", () => {
  const verdict = analyzeAnnulment({
    donation: donation({ status: "pending" }),
    hasMovement: false,
  });
  assert.equal(verdict.allowed, false);
  assert.equal(verdict.blockers[0].code, "invalid_status");
  assert.equal(verdict.impact, null);
});

test("una donación conciliada se puede anular pero avisa de las consecuencias reales", () => {
  const verdict = analyzeAnnulment({
    donation: donation({ status: "reconciled", reconciledAt: "2026-03-01T00:00:00.000Z" }),
    hasMovement: true,
  });
  assert.equal(verdict.allowed, true);
  assert.equal(verdict.impact.reconciled, true);
  assert.equal(verdict.warnings.some((w) => w.code === "reconciled"), true);
  assert.match(
    verdict.warnings.find((w) => w.code === "reconciled").message,
    /CONCILIADA con el banco/,
  );
});

test("sin asiento se avisa de que no habrá compensación", () => {
  const verdict = analyzeAnnulment({ donation: donation(), hasMovement: false });
  assert.equal(verdict.allowed, true);
  assert.equal(verdict.impact.reversal, false);
  assert.equal(verdict.warnings.some((w) => w.code === "no_movement"), true);
});

// ─── Plan en bloque por campaña ──────────────────────────────────────────────

test("el plan en bloque separa lo anulable de lo bloqueado y suma el importe", () => {
  const plan = planCampaignAnnulment({
    campaignId: 3,
    donations: [
      donation({ id: 16, amount: 60, status: "approved" }),
      donation({ id: 17, amount: 40.5, status: "reconciled", reconciledAt: "2026-03-01T00:00:00.000Z" }),
      donation({ id: 18, amount: 25, status: "pending" }),
      donation({ id: 19, amount: 10, status: "rejected" }),
    ],
    movementDonationIds: [16, 17],
  });

  assert.equal(plan.allowed, true);
  assert.deepEqual(
    plan.annullable.map((item) => item.donationId),
    [16, 17],
  );
  assert.equal(plan.totalAmount, 100.5);
  assert.equal(plan.reconciledCount, 1);
  assert.deepEqual(
    plan.blocked.map((item) => item.donationId),
    [18, 19],
  );
  assert.match(plan.blocked[0].message, /confirmadas/);
});

test("las donaciones ya anuladas no se repiten ni cuentan como bloqueo", () => {
  const plan = planCampaignAnnulment({
    campaignId: 3,
    donations: [
      donation({ id: 16, status: "annulled" }),
      donation({ id: 17, status: "approved" }),
    ],
    movementDonationIds: [16, 17],
  });
  assert.deepEqual(
    plan.annullable.map((item) => item.donationId),
    [17],
  );
  assert.deepEqual(plan.blocked, []);
});

test("sin donaciones anulables el plan no está permitido", () => {
  const plan = planCampaignAnnulment({
    campaignId: 3,
    donations: [donation({ id: 18, status: "pending" })],
    movementDonationIds: [],
  });
  assert.equal(plan.allowed, false);
  assert.equal(plan.totalAmount, 0);
  assert.equal(plan.blocked.length, 1);
});

// ─── Validación de la petición ───────────────────────────────────────────────

const body = (overrides = {}) => ({
  confirm: true,
  reason: "campaña de demostración con datos ficticios",
  password: "s3cret!",
  ...overrides,
});

test("la anulación exige confirmación explícita", () => {
  const result = validateAnnulmentRequest(body({ confirm: undefined }));
  assert.equal(result.ok, false);
  assert.equal(result.code, "confirmation_required");
});

test("la anulación exige un motivo suficientemente largo", () => {
  const result = validateAnnulmentRequest(body({ reason: "corto" }));
  assert.equal(result.ok, false);
  assert.equal(result.code, "reason_required");
  assert.equal(MIN_ANNUL_REASON, 10);
});

test("la anulación exige reautenticación", () => {
  const result = validateAnnulmentRequest(body({ password: "" }));
  assert.equal(result.ok, false);
  assert.equal(result.code, "reauth_required");
});

test("una petición completa se normaliza (motivo recortado, TOTP opcional)", () => {
  const result = validateAnnulmentRequest(body({ reason: "  datos de prueba  " }));
  assert.equal(result.ok, true);
  assert.equal(result.value.reason, "datos de prueba");
  assert.equal(result.value.totpCode, null);

  const withTotp = validateAnnulmentRequest(body({ totpCode: " 123456 " }));
  assert.equal(withTotp.value.totpCode, "123456");
});

// ─── PRUEBA CONTABLE: el libro sigue cuadrando tras anular ───────────────────

test("tras anular, el informe de integridad sigue CUADRADO y sano", () => {
  // Estado real: donación de 60 aprobada (asiento de ingreso) + su anulación
  // (asiento compensatorio de 60) y la donación ya marcada como anulada.
  const report = auditLedger({
    movements: [
      { id: 1, campaignId: 3, kind: "ingreso", amount: 60, sourceType: "donation", sourceId: 16 },
      {
        id: 2,
        campaignId: 3,
        kind: "gasto",
        amount: 60,
        sourceType: "donation_reversal",
        sourceId: 16,
      },
    ],
    donations: [{ id: 16, campaignId: 3, amount: 60, confirmed: false }],
    expenses: [],
    chain: OK_CHAIN,
  });

  assert.equal(report.chain.verified, true);
  assert.deepEqual(report.movementsWithoutSource, [], "el reverso resuelve a su donación");
  assert.deepEqual(report.amountMismatches, []);
  assert.deepEqual(report.campaignMismatches, []);
  assert.deepEqual(report.duplicateMovements, [], "orígenes distintos, un asiento cada uno");
  assert.deepEqual(report.donationsWithoutMovement, [], "una anulada no es un ingreso sin asiento");

  const totals = report.totals.find((t) => t.campaignId === 3);
  assert.equal(totals.ledgerIncome, 60);
  assert.equal(totals.ledgerExpense, 60);
  assert.equal(totals.ledgerNet, 0, "el libro neto vuelve a cero");
  assert.equal(totals.sourceNet, 0, "la donación anulada ya no es un origen");
  assert.equal(totals.balanced, true);
  assert.deepEqual(report.unbalancedCampaigns, []);
  assert.equal(report.healthy, true);
});

test("sin el asiento compensatorio el libro quedaría DESCUADRADO (por eso es obligatorio)", () => {
  // Contraprueba: si se anulara la donación sin añadir el reverso, el libro
  // seguiría contando el ingreso y el saldo no cuadraría con sus orígenes.
  const report = auditLedger({
    movements: [
      { id: 1, campaignId: 3, kind: "ingreso", amount: 60, sourceType: "donation", sourceId: 16 },
    ],
    donations: [{ id: 16, campaignId: 3, amount: 60, confirmed: false }],
    expenses: [],
    chain: OK_CHAIN,
  });

  const totals = report.totals.find((t) => t.campaignId === 3);
  assert.equal(totals.ledgerNet, 60);
  assert.equal(totals.sourceNet, 0);
  assert.equal(totals.balanced, false);
  assert.deepEqual(report.unbalancedCampaigns, [3]);
  assert.equal(report.healthy, false);
});

test("una donación aprobada y NO anulada sigue contando como ingreso (control)", () => {
  const report = auditLedger({
    movements: [
      { id: 1, campaignId: 3, kind: "ingreso", amount: 60, sourceType: "donation", sourceId: 16 },
    ],
    donations: [{ id: 16, campaignId: 3, amount: 60, confirmed: true }],
    expenses: [],
    chain: OK_CHAIN,
  });
  const totals = report.totals.find((t) => t.campaignId === 3);
  assert.equal(totals.balanced, true);
  assert.equal(totals.sourceIncome, 60);
  assert.equal(report.healthy, true);
});

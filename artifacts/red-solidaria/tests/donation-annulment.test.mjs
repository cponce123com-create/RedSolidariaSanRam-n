// Anulación contable de donaciones (V7.2.2) — presentación PURA del panel.
//
// Regresión cubierta: la interfaz solo ofrece anular a quien puede (superadmin) y
// sobre lo que se puede (donaciones confirmadas), y explica SIEMPRE que no se
// borra nada: se compensa en el libro.
import { test } from "node:test";
import assert from "node:assert/strict";

const {
  MIN_ANNUL_REASON,
  annulmentHeadline,
  annulmentSummary,
  campaignIdentifierMatches,
  canVoidDonation,
  describeAnnulmentPlan,
  reconciledWarning,
  reversalNotice,
  voidBlockReason,
} = await import("./dist/donation-annulment.mjs");

const plan = (overrides = {}) => ({
  campaignId: 3,
  annullable: [
    { donationId: 16, amount: 60, campaignId: 3, reversal: true, reconciled: false },
    { donationId: 17, amount: 100.5, campaignId: 3, reversal: true, reconciled: true },
  ],
  blocked: [
    { donationId: 18, status: "pending", message: "Solo se anulan donaciones confirmadas." },
  ],
  totalAmount: 160.5,
  reconciledCount: 1,
  allowed: true,
  ...overrides,
});

// ─── Decisión ────────────────────────────────────────────────────────────────

test("solo el superadmin puede anular, y solo donaciones confirmadas", () => {
  assert.equal(canVoidDonation("approved", "superadmin"), true);
  assert.equal(canVoidDonation("reconciled", "superadmin"), true);
  assert.equal(canVoidDonation("approved", "administrador"), false);
  assert.equal(canVoidDonation("approved", "moderador"), false);
  assert.equal(canVoidDonation("approved", null), false);
  assert.equal(canVoidDonation("pending", "superadmin"), false);
  assert.equal(canVoidDonation("rejected", "superadmin"), false);
  assert.equal(canVoidDonation("annulled", "superadmin"), false);
});

test("voidBlockReason explica el motivo y la alternativa", () => {
  assert.equal(voidBlockReason("approved"), null);
  assert.equal(voidBlockReason("reconciled"), null);
  assert.match(voidBlockReason("pending"), /recházala con la acción normal/);
  assert.match(voidBlockReason("annulled"), /ya está anulada/);
  assert.match(voidBlockReason("otro"), /estado «otro»/);
});

// ─── Resumen y titulares ─────────────────────────────────────────────────────

test("annulmentSummary resume el plan y tolera la ausencia de datos", () => {
  assert.deepEqual(annulmentSummary(plan()), {
    count: 2,
    totalAmount: 160.5,
    reconciled: 1,
    blocked: 1,
  });
  assert.deepEqual(annulmentSummary(null), {
    count: 0,
    totalAmount: 0,
    reconciled: 0,
    blocked: 0,
  });
});

test("el titular concuerda en número y no invita a confirmar sin nada que anular", () => {
  assert.equal(annulmentHeadline(plan()), "2 donaciones se anularán contablemente");
  assert.equal(
    annulmentHeadline(plan({ annullable: [plan().annullable[0]], totalAmount: 60 })),
    "1 donación se anulará contablemente",
  );
  assert.equal(annulmentHeadline(plan({ allowed: false })), "No hay donaciones confirmadas que anular");
  assert.equal(annulmentHeadline(null), "Analizando las donaciones…");
});

test("describeAnnulmentPlan muestra el recuento y el importe con dos decimales", () => {
  assert.equal(describeAnnulmentPlan(plan()), "2 donaciones · S/ 160.50");
  assert.equal(
    describeAnnulmentPlan(plan({ annullable: [plan().annullable[0]], totalAmount: 60 })),
    "1 donación · S/ 60.00",
  );
  assert.equal(describeAnnulmentPlan(plan({ annullable: [] })), "Sin donaciones que anular");
});

test("reconciledWarning solo aparece si hay dinero conciliado con el banco", () => {
  assert.equal(reconciledWarning(plan({ reconciledCount: 0 })), null);
  assert.equal(reconciledWarning(null), null);
  assert.match(reconciledWarning(plan()), /CONCILIADA\(S\) con el banco/);
});

test("reversalNotice cuenta los asientos compensatorios y avisa de que no se borra nada", () => {
  const text = reversalNotice(plan());
  assert.match(text, /Se añadirán 2 asiento\(s\) compensatorio\(s\)/);
  assert.match(text, /No se borra ningún registro/);
  assert.equal(reversalNotice(plan({ annullable: [] })), "");
  assert.equal(reversalNotice(null), "");
});

test("campaignIdentifierMatches exige el identificador exacto (con espacios tolerados)", () => {
  assert.equal(campaignIdentifierMatches("3", 3), true);
  assert.equal(campaignIdentifierMatches("  3  ", 3), true);
  assert.equal(campaignIdentifierMatches("03", 3), false);
  assert.equal(campaignIdentifierMatches("", 3), false);
});

test("el mínimo del motivo coincide con el que exige el servidor", () => {
  assert.equal(MIN_ANNUL_REASON, 10);
});

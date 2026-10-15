// Clasificación MANUAL de gastos (V11) — validación PURA.
//
// Es lo que desbloquea los gastos HUÉRFANOS: sin campaña no hay declaración DEMO
// posible, así que quedaban en «revisión manual» para siempre. La declaración no
// habilita nada por sí sola —`diagnoseExpense` vuelve a decidir— pero sin ella el
// huérfano era imborrable.
import { test } from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL ??= "postgres://localhost:5432/nonexistent";

const {
  MANUAL_CLASSIFICATIONS,
  MANUAL_CLASSIFICATION_LABEL,
  MIN_CLASSIFICATION_REASON,
  validateClassificationRequest,
} = await import("./dist/lib/expense-manual-classification.mjs");

const { diagnoseExpense } = await import("./dist/lib/expense-cleanup.mjs");

test("solo se aceptan las tres clasificaciones previstas", () => {
  assert.deepEqual([...MANUAL_CLASSIFICATIONS], ["demo", "real", "pending"]);
  for (const classification of MANUAL_CLASSIFICATIONS) {
    const result = validateClassificationRequest({
      classification,
      reason: "Motivo suficientemente largo para la auditoría",
    });
    assert.equal(result.ok, true, classification);
    assert.equal(result.value.classification, classification);
  }
  for (const invalid of ["", "DEMO", "ficticio", "  ", null, 42]) {
    const result = validateClassificationRequest({
      classification: invalid,
      reason: "Motivo suficientemente largo para la auditoría",
    });
    assert.equal(result.ok, false, JSON.stringify(invalid));
    assert.equal(result.code, "invalid_classification");
  }
});

test("el motivo es obligatorio y con longitud mínima", () => {
  const short = validateClassificationRequest({ classification: "demo", reason: "corto" });
  assert.equal(short.ok, false);
  assert.equal(short.code, "reason_required");

  const ok = validateClassificationRequest({
    classification: "demo",
    reason: "x".repeat(MIN_CLASSIFICATION_REASON),
  });
  assert.equal(ok.ok, true);
});

test("la evidencia es opcional pero acotada", () => {
  const withoutEvidence = validateClassificationRequest({
    classification: "real",
    reason: "Motivo suficientemente largo para la auditoría",
  });
  assert.equal(withoutEvidence.ok, true);
  assert.equal(withoutEvidence.value.evidence, null);

  const tooLong = validateClassificationRequest({
    classification: "real",
    reason: "Motivo suficientemente largo para la auditoría",
    evidence: "x".repeat(501),
  });
  assert.equal(tooLong.ok, false);
  assert.equal(tooLong.code, "evidence_too_long");
});

test("las etiquetas son las que ve el superadmin", () => {
  assert.equal(MANUAL_CLASSIFICATION_LABEL.demo, "DEMO confirmado");
  assert.equal(MANUAL_CLASSIFICATION_LABEL.real, "Real");
  assert.equal(MANUAL_CLASSIFICATION_LABEL.pending, "Pendiente de revisión");
});

// ─── El efecto de la declaración sobre el diagnóstico ───────────────────────

const ORPHAN_EXPENSE = {
  id: 1,
  campaignId: 999001,
  description: "Gasto huérfano de prueba",
  amount: 1200,
  date: "2026-01-15",
  category: "general",
  responsible: null,
  observations: null,
  receiptUrl: null,
  receiptType: null,
  isPublic: false,
  createdAt: new Date("2026-01-15T10:00:00Z"),
};

function diagnose(manualClassification) {
  return diagnoseExpense({
    expense: ORPHAN_EXPENSE,
    campaign: null, // su campaña ya no existe
    classification: "pending",
    protectedCampaignIds: [],
    campaignMovements: [],
    manualClassification,
  });
}

test("un huérfano SIN clasificar queda bloqueado en revisión manual", () => {
  const diagnosis = diagnose(null);
  assert.equal(diagnosis.isOrphan, true);
  assert.equal(diagnosis.action, "review");
  assert.equal(diagnosis.deletable, false);
  assert.deepEqual(diagnosis.blockers, ["orphan_expense"]);
});

test("un huérfano clasificado DEMO (sin asiento) pasa a eliminación definitiva", () => {
  const diagnosis = diagnose({
    classification: "demo",
    reason: "Gasto de prueba de una campaña que ya se eliminó",
    classifiedBy: "superadmin",
  });
  assert.equal(diagnosis.action, "delete");
  assert.equal(diagnosis.deletable, true);
  assert.deepEqual(diagnosis.blockers, []);
  assert.equal(diagnosis.classification, "demo");
  // Se conserva la clasificación deducida para que la interfaz explique el cambio.
  assert.equal(diagnosis.computedClassification, "pending");
  assert.equal(diagnosis.manualClassification?.classifiedBy, "superadmin");
  assert.match(diagnosis.reasons.join(" "), /Clasificación MANUAL/);
});

test("un huérfano clasificado REAL NO se destruye", () => {
  const diagnosis = diagnose({
    classification: "real",
    reason: "Corresponde a una compra auténtica con boleta en papel",
  });
  assert.equal(diagnosis.deletable, false);
  assert.equal(diagnosis.action, "regularize");
  assert.equal(diagnosis.classification, "real");
});

test("la declaración manual no puede levantar la protección de ChocoFest", () => {
  const diagnosis = diagnoseExpense({
    expense: { ...ORPHAN_EXPENSE, campaignId: 3 },
    campaign: { id: 3, title: "Chocofest 2025", status: "active", isDemo: false },
    classification: "pending",
    protectedCampaignIds: [3],
    campaignMovements: [],
    manualClassification: {
      classification: "demo",
      reason: "Intento de declarar DEMO una campaña protegida",
    },
  });
  assert.equal(diagnosis.protectedCampaign, true);
  assert.equal(diagnosis.deletable, false);
  assert.equal(diagnosis.action, "review");
  assert.deepEqual(diagnosis.blockers, ["protected_campaign"]);
});

test("la declaración manual tampoco destruye un gasto con documento propio", () => {
  const diagnosis = diagnoseExpense({
    expense: {
      ...ORPHAN_EXPENSE,
      receiptUrl: "https://res.cloudinary.com/redsolidaria/image/upload/v1/boleta.jpg",
    },
    campaign: null,
    classification: "pending",
    protectedCampaignIds: [],
    campaignMovements: [],
    manualClassification: {
      classification: "demo",
      reason: "Se declara DEMO aunque tenga comprobante propio",
    },
  });
  assert.equal(diagnosis.deletable, false);
  assert.equal(diagnosis.conservationObligation, true);
  assert.equal(diagnosis.action, "regularize");
  assert.match(diagnosis.reasons.join(" "), /obligación de conservación/);
});

test("un gasto clasificado DEMO con asiento sigue exigiendo cadena segura", () => {
  const movement = {
    id: 7,
    campaignId: 999001,
    kind: "gasto",
    amount: 1200,
    description: "Asiento del gasto huérfano",
    sourceType: "expense",
    sourceId: 1,
    createdAt: new Date("2026-01-15T10:00:00Z"),
    prevHash: "genesis",
    hash: "hash-7",
  };
  const diagnosis = diagnoseExpense({
    expense: ORPHAN_EXPENSE,
    campaign: null,
    classification: "pending",
    protectedCampaignIds: [],
    campaignMovements: [movement],
    manualClassification: {
      classification: "demo",
      reason: "Gasto de prueba con su asiento de prueba",
    },
  });
  assert.equal(diagnosis.hasLedgerEntry, true);
  assert.equal(diagnosis.chainVerifiedAfterRemoval, true);
  assert.equal(diagnosis.action, "purge_with_ledger");
  assert.equal(diagnosis.deletable, true);
});

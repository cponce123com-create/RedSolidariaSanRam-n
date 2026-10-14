import { test } from "node:test";
import assert from "node:assert/strict";

// Módulo puro: no importa la DB, se puede cargar directamente.
const {
  CAMPAIGN_STATUSES,
  HIDDEN_STATUSES,
  allowedTransitions,
  auxiliaryDependencies,
  canTransition,
  deleteBlockReason,
  deleteDiagnostic,
  dependencyBreakdown,
  dependencyLabel,
  isCampaignStatus,
  isHiddenStatus,
  protectedDependencies,
  protagonistError,
  statusLabel,
  totalDependencies,
  transitionError,
} = await import("./dist/lib/campaign-lifecycle.mjs");

const deps = (overrides = {}) => ({
  donations: 0,
  movements: 0,
  expenses: 0,
  protectedEvidence: 0,
  protectedLeftovers: 0,
  images: 0,
  updates: 0,
  budgets: 0,
  auxiliaryEvidence: 0,
  auxiliaryLeftovers: 0,
  communityReports: 0,
  ...overrides,
});

test("estados válidos: se reconocen los cinco del ciclo de vida", () => {
  assert.deepEqual([...CAMPAIGN_STATUSES], [
    "draft",
    "active",
    "paused",
    "completed",
    "archived",
  ]);
  for (const s of CAMPAIGN_STATUSES) assert.equal(isCampaignStatus(s), true);
  assert.equal(isCampaignStatus("activo"), false);
  assert.equal(isCampaignStatus(null), false);
  assert.equal(isCampaignStatus(7), false);
});

test("estados ocultos al público: solo borrador y archivada", () => {
  assert.deepEqual([...HIDDEN_STATUSES], ["draft", "archived"]);
  assert.equal(isHiddenStatus("draft"), true);
  assert.equal(isHiddenStatus("archived"), true);
  assert.equal(isHiddenStatus("active"), false);
  assert.equal(isHiddenStatus(undefined), false);
});

test("transiciones permitidas del ciclo de vida", () => {
  assert.equal(canTransition("draft", "active"), true);
  assert.equal(canTransition("paused", "active"), true);
  assert.equal(canTransition("active", "paused"), true);
  assert.equal(canTransition("active", "completed"), true);
  assert.equal(canTransition("active", "draft"), true);
  assert.equal(canTransition("completed", "active"), true);
  assert.equal(canTransition("draft", "archived"), true);
  assert.equal(canTransition("active", "archived"), true);
  assert.equal(canTransition("completed", "archived"), true);
  assert.equal(canTransition("archived", "completed"), true);
});

test("transiciones NO permitidas (se rechazan con 409 en la ruta)", () => {
  assert.equal(canTransition("draft", "completed"), false);
  assert.equal(canTransition("draft", "paused"), false);
  assert.equal(canTransition("archived", "active"), false);
  assert.equal(canTransition("completed", "paused"), false);
  assert.equal(canTransition("active", "active"), false);
  assert.equal(canTransition("inexistente", "active"), false);
});

test("allowedTransitions y mensajes accionables", () => {
  assert.deepEqual(allowedTransitions("draft"), ["active", "archived"]);
  assert.equal(allowedTransitions("inexistente").length, 0);
  const msg = transitionError("draft", "completed");
  assert.match(msg, /borrador/);
  assert.match(msg, /finalizada/);
  assert.equal(statusLabel("draft"), "borrador");
  assert.equal(statusLabel("otro"), "otro");
});

// ─── Clasificación de dependencias (Fase 1.1) ────────────────────────────────

test("clasificación: protegidas, auxiliares y desvinculables", () => {
  assert.equal(protectedDependencies(deps()), 0);
  assert.equal(
    protectedDependencies(deps({ donations: 2, movements: 1, expenses: 3, protectedEvidence: 1, protectedLeftovers: 1 })),
    8,
  );
  assert.equal(
    auxiliaryDependencies(deps({ images: 2, updates: 1, budgets: 1, auxiliaryEvidence: 1, auxiliaryLeftovers: 1, communityReports: 2 })),
    8,
  );
  // Los reportes ciudadanos NO son protegidos: no bloquean.
  assert.equal(protectedDependencies(deps({ communityReports: 5 })), 0);
  assert.equal(auxiliaryDependencies(deps({ communityReports: 5 })), 5);
});

test("totalDependencies suma todas las fuentes", () => {
  assert.equal(totalDependencies(deps()), 0);
  assert.equal(totalDependencies(deps({ donations: 3, images: 2, updates: 1 })), 6);
  assert.equal(totalDependencies(deps({ movements: 1, communityReports: 2 })), 3);
});

test("dependencyBreakdown marca la disposición de cada dependencia", () => {
  const breakdown = dependencyBreakdown(
    deps({ donations: 1, images: 3, communityReports: 2 }),
  );
  const byKey = Object.fromEntries(breakdown.map((e) => [e.key, e]));
  assert.equal(byKey.donations.disposition, "protected");
  assert.equal(byKey.images.disposition, "delete");
  assert.equal(byKey.communityReports.disposition, "unlink");
  // Solo aparecen las dependencias presentes.
  assert.equal(breakdown.length, 3);
  assert.equal(dependencyLabel("movements"), "movimientos del libro contable");
});

// ─── Borrado permanente (Fase 1.5, pruebas 1-6) ──────────────────────────────

test("PRUEBA 1 · borrador vacío: se elimina", () => {
  assert.equal(deleteBlockReason("draft", deps()), null);
  assert.equal(deleteDiagnostic("draft", deps()).canDelete, true);
});

test("PRUEBA 2 · borrador con dependencias AUXILIARES: se elimina de forma segura", () => {
  // Imágenes, novedades, presupuestos, evidencias de actividad y bienes de
  // referencia NO impiden el borrado: se limpian en la misma transacción.
  const onlyAuxiliary = deps({
    images: 8,
    updates: 4,
    budgets: 2,
    auxiliaryEvidence: 2,
    auxiliaryLeftovers: 1,
  });
  assert.equal(totalDependencies(onlyAuxiliary), 17); // el caso «17 registros»
  assert.equal(deleteBlockReason("draft", onlyAuxiliary), null);

  const diagnostic = deleteDiagnostic("draft", onlyAuxiliary);
  assert.equal(diagnostic.canDelete, true);
  assert.equal(diagnostic.protectedCount, 0);
  assert.equal(diagnostic.auxiliaryCount, 17);
  // La desvinculación de reportes tampoco bloquea.
  assert.equal(deleteBlockReason("draft", deps({ communityReports: 3 })), null);
});

test("PRUEBA 3 · borrador con donaciones confirmadas: se bloquea", () => {
  const blocked = deleteBlockReason("draft", deps({ donations: 2 }));
  assert.match(blocked, /2 donaciones/);
  assert.match(blocked, /Archívalo/);
});

test("PRUEBA 4 · campaña con movimientos contables: se bloquea", () => {
  const blocked = deleteBlockReason("draft", deps({ movements: 1 }));
  assert.match(blocked, /movimientos del libro contable/);
});

test("PRUEBA 5 · campaña archivada: conserva su historial (no se borra)", () => {
  assert.match(deleteBlockReason("archived", deps()), /archivarse/);
  assert.match(deleteBlockReason("active", deps()), /archivarse/);
  assert.match(deleteBlockReason("completed", deps()), /archivarse/);
  assert.match(deleteBlockReason("paused", deps()), /archivarse/);
});

test("PRUEBA 6 · diagnóstico: dependencias concretas y operaciones permitidas", () => {
  const diagnostic = deleteDiagnostic("draft", deps({ donations: 1, expenses: 3, images: 2 }));
  assert.equal(diagnostic.canDelete, false);
  assert.equal(diagnostic.canArchive, true);
  assert.match(diagnostic.blockedReason, /donaciones/);
  assert.match(diagnostic.blockedReason, /gastos ejecutados/);
  // Las auxiliares no entran en el motivo de bloqueo.
  assert.doesNotMatch(diagnostic.blockedReason, /imágenes/);
  assert.equal(diagnostic.protectedCount, 4);
  assert.equal(diagnostic.auxiliaryCount, 2);

  const operations = Object.fromEntries(
    diagnostic.operations.map((o) => [o.operation, o]),
  );
  assert.equal(operations.delete.available, false);
  assert.equal(operations.archive.available, true);
  assert.match(operations.delete.reason, /donaciones/);
});

test("diagnóstico: un borrador con contabilidad no admite purga de datos de prueba", () => {
  const diagnostic = deleteDiagnostic("draft", deps({ movements: 2 }));
  const purge = diagnostic.operations.find((o) => o.operation === "testPurge");
  assert.equal(purge.available, false);
  assert.match(purge.reason, /libro contable/);

  const clean = deleteDiagnostic("draft", deps({ images: 1 }));
  assert.equal(clean.operations.find((o) => o.operation === "testPurge").available, true);
});

test("protagonista de la portada: solo campañas visibles al público", () => {
  assert.equal(protagonistError("active"), null);
  assert.equal(protagonistError("paused"), null);
  assert.equal(protagonistError("completed"), null);
  assert.match(protagonistError("draft"), /borrador/);
  assert.match(protagonistError("archived"), /archivada/);
  assert.match(protagonistError("draft"), /Publícala/);
});

// Presentación del diagnóstico de borrado de campañas (V7.1 · Fase 1.4).
// Regresión cubierta: la interfaz ya no decide el borrado por el ESTADO de la
// campaña, sino por las DEPENDENCIAS reales que informa el servidor.
import { test } from "node:test";
import assert from "node:assert/strict";

const {
  canPurgeTestData,
  deletionHeadline,
  describeDependencies,
  findOperation,
  groupDependencies,
  totalOf,
} = await import("./dist/campaign-deletion.mjs");

const dependency = (key, count, disposition) => ({
  key,
  label: key,
  count,
  disposition,
});

function diagnostic(overrides = {}) {
  return {
    status: "draft",
    statusLabel: "borrador",
    canDelete: true,
    canArchive: true,
    blockedReason: null,
    total: 0,
    protectedCount: 0,
    auxiliaryCount: 0,
    dependencies: [],
    operations: [
      { operation: "delete", label: "Eliminación definitiva", available: true },
      { operation: "archive", label: "Archivar (conserva historial)", available: true },
      { operation: "testPurge", label: "Purga de datos de prueba", available: true },
    ],
    ...overrides,
  };
}

test("groupDependencies: separa protegidas, eliminables y desvinculables", () => {
  const grouped = groupDependencies([
    dependency("donations", 2, "protected"),
    dependency("images", 5, "delete"),
    dependency("communityReports", 1, "unlink"),
    dependency("updates", 0, "delete"), // sin filas: se ignora
  ]);
  assert.equal(grouped.protected.length, 1);
  assert.equal(grouped.removed.length, 1);
  assert.equal(grouped.unlinked.length, 1);
  assert.equal(grouped.protected[0].key, "donations");
  assert.equal(grouped.removed[0].key, "images");
  assert.equal(grouped.unlinked[0].key, "communityReports");
});

test("totalOf suma los recuentos ignorando negativos", () => {
  assert.equal(totalOf([]), 0);
  assert.equal(
    totalOf([dependency("images", 3, "delete"), dependency("updates", 2, "delete")]),
    5,
  );
  assert.equal(totalOf([dependency("images", -4, "delete")]), 0);
});

test("describeDependencies: frase legible con cantidades", () => {
  assert.equal(describeDependencies([]), "");
  assert.equal(
    describeDependencies([
      dependency("donaciones", 2, "protected"),
      dependency("imágenes", 3, "delete"),
    ]),
    "2 donaciones, 3 imágenes",
  );
});

test("findOperation localiza una operación del diagnóstico", () => {
  const diag = diagnostic();
  assert.equal(findOperation(diag, "delete")?.available, true);
  assert.equal(findOperation(diag, "inexistente"), undefined);
});

test("canPurgeTestData: exige disponibilidad Y rol superadmin", () => {
  const diag = diagnostic();
  assert.equal(canPurgeTestData(diag, "superadmin"), true);
  assert.equal(canPurgeTestData(diag, "administrador"), false);
  assert.equal(canPurgeTestData(diag, "moderador"), false);
  assert.equal(canPurgeTestData(diag, null), false);
  assert.equal(canPurgeTestData(diag, undefined), false);

  // Aunque sea superadmin, si el servidor no ofrece la purga (hay contabilidad),
  // la interfaz no la muestra.
  const blocked = diagnostic({
    operations: [
      { operation: "testPurge", label: "Purga", available: false, reason: "libro contable" },
    ],
  });
  assert.equal(canPurgeTestData(blocked, "superadmin"), false);
});

test("deletionHeadline: refleja lo que se puede hacer", () => {
  assert.equal(deletionHeadline(diagnostic({ canDelete: true })), "Listo para eliminar");
  assert.equal(
    deletionHeadline(diagnostic({ canDelete: false, canArchive: true })),
    "No se puede eliminar: archívala",
  );
  assert.equal(
    deletionHeadline(diagnostic({ canDelete: false, canArchive: false })),
    "Operación no disponible",
  );
});

import { test } from "node:test";
import assert from "node:assert/strict";

// El bundle de las proyecciones importa @workspace/db (exige DATABASE_URL al
// cargar; el pool no se conecta hasta la primera query).
process.env.DATABASE_URL ??= "postgres://localhost:5432/nonexistent";

const { PUBLIC_ALLY_COLUMNS, PUBLIC_REPORT_COLUMNS } = await import(
  "./dist/lib/public-projections.mjs"
);
const { formatLeftover, formatPublicLeftover } = await import(
  "./dist/routes/campaign-leftovers.mjs"
);

test("la proyección pública de aliados excluye los datos de contacto internos", () => {
  const keys = Object.keys(PUBLIC_ALLY_COLUMNS);
  assert.ok(keys.includes("name"));
  assert.ok(keys.includes("description"));
  assert.ok(keys.includes("website"));

  for (const key of ["contactName", "contactEmail", "contactPhone"]) {
    assert.equal(PUBLIC_ALLY_COLUMNS[key], undefined, `${key} no debe salir en /allies`);
  }
});

test("la proyección pública de reportes excluye identidad y notas internas", () => {
  const keys = Object.keys(PUBLIC_REPORT_COLUMNS);
  assert.ok(keys.includes("title"));
  assert.ok(keys.includes("description"));
  assert.ok(keys.includes("location"));
  assert.ok(keys.includes("campaignId"));

  for (const key of [
    "reporterName",
    "reporterPhone",
    "reporterEmail",
    "adminNotes",
  ]) {
    assert.equal(PUBLIC_REPORT_COLUMNS[key], undefined, `${key} no debe salir en /reports/*`);
  }
});

test("la proyección pública de reportes no incluye marcas internas de revisión", () => {
  // El estado siempre está filtrado a approved en la consulta; no necesita
  // viajar al navegador ni abre la puerta a exponer otros estados.
  assert.equal(PUBLIC_REPORT_COLUMNS.status, undefined);
  assert.equal(PUBLIC_REPORT_COLUMNS.adminNotes, undefined);
});

test("el DTO público de bienes oculta los vínculos internos con donantes y evidencias", () => {
  const row = {
    id: 7,
    campaignId: 3,
    item: "Canasta",
    quantity: 2,
    unit: "unidad",
    notes: "Entregado en la jornada",
    isPublic: true,
    category: "canastas",
    targetQty: 10,
    receivedQty: 4,
    usedQty: 2,
    composition: "arroz | 2 kg",
    donorId: 99,
    evidenceId: 42,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
  };

  const publicRow = formatPublicLeftover(row);
  assert.equal(publicRow.item, "Canasta");
  assert.equal(publicRow.composition, "arroz | 2 kg");
  assert.equal(publicRow.donorId, undefined);
  assert.equal(publicRow.evidenceId, undefined);
  assert.equal(publicRow.isPublic, undefined);

  // El DTO administrativo conserva la trazabilidad completa.
  const adminRow = formatLeftover(row);
  assert.equal(adminRow.donorId, 99);
  assert.equal(adminRow.evidenceId, 42);
});

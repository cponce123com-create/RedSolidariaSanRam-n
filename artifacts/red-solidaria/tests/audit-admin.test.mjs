// Presentación del registro de auditoría (funciones puras, sin red).
import { test } from "node:test";
import assert from "node:assert/strict";

const {
  auditActionLabel,
  auditResourceLabel,
  buildAuditLogsUrl,
  summarizeAuditDetails,
} = await import("./dist/audit-admin.mjs");

test("auditActionLabel: traduce las acciones conocidas y conserva el resto", () => {
  assert.equal(auditActionLabel("DONATION_RECONCILED"), "Donación conciliada con el banco");
  assert.equal(auditActionLabel("CAMPAIGN_DELETED"), "Borrador de campaña eliminado");
  assert.equal(auditActionLabel("ACCION_DESCONOCIDA"), "ACCION_DESCONOCIDA");
});

test("auditResourceLabel: traduce recursos y tolera nulos", () => {
  assert.equal(auditResourceLabel("donations"), "Donaciones");
  assert.equal(auditResourceLabel("campaigns"), "Campañas");
  assert.equal(auditResourceLabel("otro"), "otro");
  assert.equal(auditResourceLabel(null), "—");
  assert.equal(auditResourceLabel(undefined), "—");
});

test("buildAuditLogsUrl: sin filtros no añade query string", () => {
  assert.equal(buildAuditLogsUrl(), "/api/admin/audit-logs");
  assert.equal(buildAuditLogsUrl({}), "/api/admin/audit-logs");
});

test("buildAuditLogsUrl: añade solo los filtros presentes y recorta el usuario", () => {
  const url = buildAuditLogsUrl({ action: "DONATION_RECONCILED", username: "  ana ", limit: 20 });
  assert.match(url, /^\/api\/admin\/audit-logs\?/);
  assert.match(url, /action=DONATION_RECONCILED/);
  assert.match(url, /username=ana/);
  assert.match(url, /limit=20/);
  assert.doesNotMatch(url, /resource=/);
});

test("summarizeAuditDetails: aplana los detalles en texto legible", () => {
  assert.equal(
    summarizeAuditDetails({ from: "approved", to: "reconciled", amount: 50 }),
    "from: approved · to: reconciled · amount: 50",
  );
});

test("summarizeAuditDetails: tolera nulos, vacíos y valores compuestos", () => {
  assert.equal(summarizeAuditDetails(null), "—");
  assert.equal(summarizeAuditDetails({}), "—");
  assert.equal(summarizeAuditDetails("texto"), "—");
  assert.equal(summarizeAuditDetails({ tags: ["a", "b"] }), 'tags: ["a","b"]');
  assert.equal(summarizeAuditDetails({ nota: null }), "nota: —");
});

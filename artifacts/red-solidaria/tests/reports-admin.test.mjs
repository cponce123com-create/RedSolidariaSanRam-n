// Informes descargables: definiciones y construcción de URL (funciones puras).
import { test } from "node:test";
import assert from "node:assert/strict";

const { DONATION_STATUS_FILTERS, REPORTS, buildReportUrl } = await import(
  "./dist/reports-admin.mjs"
);

test("REPORTS: define los informes contables privados", () => {
  assert.equal(REPORTS.length, 2);
  const ids = REPORTS.map((r) => r.id);
  assert.deepEqual(ids, ["donations", "movements"]);
  for (const report of REPORTS) {
    assert.match(report.path, /^\/api\/admin\/reports\/.+\.csv$/);
    assert.ok(report.title.length > 0);
    assert.ok(report.description.length > 0);
  }
});

test("buildReportUrl: sin filtros devuelve la ruta base", () => {
  assert.equal(buildReportUrl("/api/admin/reports/donations.csv"), "/api/admin/reports/donations.csv");
  assert.equal(buildReportUrl("/api/admin/reports/donations.csv", {}), "/api/admin/reports/donations.csv");
});

test("buildReportUrl: añade los filtros presentes", () => {
  const url = buildReportUrl("/api/admin/reports/donations.csv", {
    status: "reconciled",
    campaignId: 12,
  });
  assert.match(url, /^\/api\/admin\/reports\/donations\.csv\?/);
  assert.match(url, /status=reconciled/);
  assert.match(url, /campaignId=12/);
});

test("buildReportUrl: ignora un ID de campaña inválido o vacío", () => {
  assert.equal(buildReportUrl("/x.csv", { campaignId: null }), "/x.csv");
  assert.equal(buildReportUrl("/x.csv", { campaignId: 0 }), "/x.csv");
  assert.equal(buildReportUrl("/x.csv", { campaignId: -3 }), "/x.csv");
  assert.equal(buildReportUrl("/x.csv", { campaignId: 1.5 }), "/x.csv");
  assert.equal(buildReportUrl("/x.csv", { campaignId: Number.NaN }), "/x.csv");
  assert.equal(buildReportUrl("/x.csv", { status: "" }), "/x.csv");
});

test("DONATION_STATUS_FILTERS: cubre los estados contables relevantes", () => {
  const values = DONATION_STATUS_FILTERS.map((o) => o.value);
  assert.deepEqual(values, ["", "pending", "approved", "reconciled", "rejected"]);
});

// Filtros del panel administrativo (funciones puras, sin DB).
// Fase 6 del Prompt Maestro V7.
import { test } from "node:test";
import assert from "node:assert/strict";

const { EMPTY_DASHBOARD_FILTERS, describeDashboardFilters, parseDashboardFilters } =
  await import("./dist/lib/dashboard-filters.mjs");

test("sin parámetros → filtros vacíos (acumulado global)", () => {
  const result = parseDashboardFilters({});
  assert.deepEqual(result, { filters: EMPTY_DASHBOARD_FILTERS });
  assert.equal(describeDashboardFilters(result.filters), "sin filtros (acumulado global)");
});

test("query ausente o con parámetros desconocidos → filtros vacíos", () => {
  for (const query of [undefined, null, {}, { foo: "bar" }, { campaignId: "", status: "" }]) {
    const result = parseDashboardFilters(query);
    assert.equal("filters" in result, true);
    assert.deepEqual(result.filters, EMPTY_DASHBOARD_FILTERS);
  }
});

test("campaignId válido se normaliza a número", () => {
  const result = parseDashboardFilters({ campaignId: "7" });
  assert.equal(result.filters.campaignId, 7);
  assert.equal(result.filters.hasDateRange, false);
});

test("campaignId inválido → error (no se inventa un filtro)", () => {
  for (const campaignId of ["0", "-3", "abc", "1.5", "  "]) {
    const result = parseDashboardFilters({ campaignId });
    // "  " es vacío → sin filtro; el resto son errores de validación.
    if (campaignId.trim() === "") {
      assert.equal(result.filters.campaignId, null);
    } else {
      assert.equal(typeof result.error, "string", `${campaignId} debería ser inválido`);
    }
  }
});

test("status debe ser un estado de campaña conocido", () => {
  assert.equal(parseDashboardFilters({ status: "active" }).filters.status, "active");
  assert.equal(parseDashboardFilters({ status: "archived" }).filters.status, "archived");
  const invalid = parseDashboardFilters({ status: "en-curso" });
  assert.match(invalid.error, /status inválido/);
  assert.match(invalid.error, /draft/);
});

test("fechas: se normalizan a ISO y marcan hasDateRange", () => {
  const result = parseDashboardFilters({ from: "2026-01-01", to: "2026-03-31" });
  assert.equal(result.filters.from, new Date("2026-01-01").toISOString());
  assert.equal(result.filters.to, new Date("2026-03-31").toISOString());
  assert.equal(result.filters.hasDateRange, true);
});

test("fechas inválidas → error", () => {
  assert.match(parseDashboardFilters({ from: "ayer" }).error, /from/);
  assert.match(parseDashboardFilters({ to: "31/03/2026" }).error, /to/);
});

test("rango invertido → error explícito", () => {
  const result = parseDashboardFilters({ from: "2026-06-01", to: "2026-01-01" });
  assert.match(result.error, /invertido/);
});

test("un solo extremo del rango es válido", () => {
  const onlyFrom = parseDashboardFilters({ from: "2026-01-01" });
  assert.equal(onlyFrom.filters.hasDateRange, true);
  assert.equal(onlyFrom.filters.to, null);
});

test("acepta parámetros repetidos (toma el primero, como Express)", () => {
  const result = parseDashboardFilters({ campaignId: ["5", "9"] });
  assert.equal(result.filters.campaignId, 5);
});

test("describeDashboardFilters resume lo aplicado", () => {
  const result = parseDashboardFilters({ campaignId: "3", status: "active", from: "2026-02-01" });
  const text = describeDashboardFilters(result.filters);
  assert.match(text, /campaña #3/);
  assert.match(text, /estado active/);
  assert.match(text, /desde 2026-02-01/);
});

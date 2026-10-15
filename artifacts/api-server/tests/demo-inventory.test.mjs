// Conciliación de las cifras del dashboard (V9.1) — lógica PURA.
//
// La conciliación debe explicar EXACTAMENTE las cifras del panel: si usara otra
// regla, «cuadrar» el saldo sería una forma de ocultar el descuadre. Estas
// pruebas fijan la equivalencia con `campaignFunding` y el reparto DEMO/real.
import { test } from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL ??= "postgres://localhost:5432/nonexistent";

const { buildReconciliation, reconciliationCsvRows, reconciliationHeadline } = await import(
  "./dist/lib/demo-inventory.mjs"
);
const { campaignFunding } = await import("./dist/lib/funding.mjs");

function world(overrides = {}) {
  return {
    campaigns: [],
    donations: [],
    expenses: [],
    movements: [],
    donors: [],
    pets: [],
    adoptionRequests: [],
    allies: [],
    news: [],
    reports: [],
    certificates: [],
    volunteers: [],
    evidence: [],
    images: [],
    protectedCampaignIds: [],
    ...overrides,
  };
}

const donation = (id, campaignId, amount, status = "approved") => ({
  id,
  campaignId,
  amount,
  status,
  email: `d${id}@ejemplo.com`,
  reconciledAt: null,
  receiptUrl: null,
  createdAt: new Date("2026-01-15T10:00:00Z"),
});

const expense = (id, campaignId, amount) => ({
  id,
  campaignId,
  description: `gasto ${id}`,
  amount,
  date: "2026-01-20",
  receiptUrl: null,
});

test("la recaudación verificada es la suma de las donaciones confirmadas", () => {
  const report = buildReconciliation(
    world({
      campaigns: [{ id: 1, title: "C", status: "active", isDemo: false, raised: 0 }],
      donations: [
        donation(1, 1, 100, "approved"),
        donation(2, 1, 200, "reconciled"),
        // Pendientes y anuladas NO cuentan (mismo criterio que el panel).
        donation(3, 1, 999, "pending"),
        donation(4, 1, 888, "annulled"),
        donation(5, 1, 777, "rejected"),
      ],
    }),
  );
  assert.equal(report.summary.verifiedRaised, 300);
  assert.equal(report.figures.verifiedRaised.lines.length, 2);
});

test("el histórico solo cuenta en campañas SIN donaciones confirmadas (sin duplicar)", () => {
  const report = buildReconciliation(
    world({
      campaigns: [
        { id: 1, title: "Con donaciones", status: "active", isDemo: false, raised: 5000 },
        { id: 2, title: "Solo histórico", status: "completed", isDemo: false, raised: 1200 },
      ],
      donations: [donation(1, 1, 300)],
    }),
  );
  // La campaña 1 tiene donaciones → su `raised` NO se suma (si no, se duplicaría).
  assert.equal(report.figures.historicalRaised.total, 1200);
  assert.deepEqual(
    report.figures.historicalRaised.lines.map((l) => l.campaignId),
    [2],
  );
  // Regla del panel (campaignFunding): el histórico SOLO entra en la cifra si no
  // hay nada verificado. Se replica tal cual; el informe lo publica para que la
  // cifra sea auditable en vez de «cuadrarla» por la puerta de atrás.
  assert.equal(report.summary.historicalCounted, false);
  assert.equal(report.summary.totalRaised, 300);
  assert.equal(report.figures.historicalRaised.lines[0].counted, true);
});

test("sin nada verificado, la cifra publicada es el histórico", () => {
  const report = buildReconciliation(
    world({
      campaigns: [{ id: 3, title: "Chocofest 2025", status: "active", isDemo: false, raised: 2818.5 }],
      protectedCampaignIds: [3],
    }),
  );
  assert.equal(report.summary.verifiedRaised, 0);
  assert.equal(report.summary.historicalCounted, true);
  assert.equal(report.summary.totalRaised, 2818.5);
  // La campaña protegida no se marca DEMO aunque su importe venga del histórico.
  assert.equal(report.summary.demoRaised, 0);
});

test("la cifra publicada coincide con la regla del panel (campaignFunding)", () => {
  const cases = [
    { verified: 300, historical: 0 },
    { verified: 0, historical: 2818.5 },
    { verified: 300, historical: 1200 },
    { verified: 0, historical: 0 },
  ];
  for (const scenario of cases) {
    const report = buildReconciliation(
      world({
        campaigns: [{ id: 2, title: "H", status: "completed", isDemo: false, raised: scenario.historical }],
        donations: scenario.verified > 0 ? [donation(1, 1, scenario.verified)] : [],
      }),
    );
    const expected = campaignFunding(scenario.historical, scenario.verified);
    assert.equal(
      report.summary.totalRaised,
      expected.reconciledRaised,
      `verificado=${scenario.verified} historico=${scenario.historical}`,
    );
    assert.equal(report.summary.historicalCounted, expected.historicalCounted);
  }
});

test("el saldo es recaudación conciliada menos gastos", () => {
  const report = buildReconciliation(
    world({
      campaigns: [{ id: 1, title: "C", status: "active", isDemo: false, raised: 0 }],
      donations: [donation(1, 1, 1000)],
      expenses: [expense(1, 1, 250), expense(2, 1, 750)],
    }),
  );
  assert.equal(report.summary.totalSpent, 1000);
  assert.equal(report.summary.balance, 0);
  assert.equal(reconciliationHeadline(report).balance, 0);
});

test("separa la parte DEMO y la pendiente de cada cifra", () => {
  const report = buildReconciliation(
    world({
      campaigns: [
        { id: 1, title: "DEMO", status: "active", isDemo: true, raised: 0 },
        { id: 3, title: "Chocofest 2025", status: "active", isDemo: false, raised: 0 },
      ],
      protectedCampaignIds: [3],
      donations: [
        donation(1, 1, 400, "approved"),
        donation(2, 3, 2818.5, "approved"),
        donation(3, 3, 60, "reconciled"),
      ],
      expenses: [expense(1, 1, 1500), expense(2, 3, 2912.8)],
    }),
  );
  // Recaudado: 400 DEMO + 2878.5 real/protegido.
  assert.equal(report.summary.totalRaised, 3278.5);
  assert.equal(report.summary.demoRaised, 400);
  assert.equal(report.summary.totalSpent, 4412.8);
  assert.equal(report.summary.demoSpent, 1500);
  // Gastos de Chocofest: su campaña es protegida → no son DEMO ni pendientes.
  assert.equal(report.figures.spent.byClassification.protected, 2912.8);
  assert.equal(report.figures.spent.byClassification.pending, 0);
});

test("informa de donaciones sin campaña y asientos huérfanos", () => {
  const report = buildReconciliation(
    world({
      campaigns: [{ id: 1, title: "C", status: "active", isDemo: false, raised: 0 }],
      donations: [donation(1, null, 250)],
      movements: [
        { id: 1, campaignId: 1, kind: "ingreso", amount: 250, sourceType: "donation", sourceId: 4242 },
      ],
    }),
  );
  assert.equal(report.integrity.donationsWithoutCampaign, 1);
  assert.equal(report.integrity.donationsWithoutCampaignAmount, 250);
  assert.equal(report.integrity.orphanMovements, 1);
  // El fondo general SÍ cuenta en la cifra global (no se oculta).
  assert.equal(report.summary.verifiedRaised, 250);
});

test("cada línea de la conciliación lleva su evidencia y su importe", () => {
  const report = buildReconciliation(
    world({
      campaigns: [{ id: 1, title: "DEMO", status: "active", isDemo: true, raised: 0 }],
      donations: [donation(7, 1, 120)],
      expenses: [expense(9, 1, 80)],
    }),
  );
  const line = report.figures.verifiedRaised.lines[0];
  assert.equal(line.id, 7);
  assert.equal(line.campaignId, 1);
  assert.equal(line.amount, 120);
  assert.equal(line.classification, "demo");
  assert.ok(line.reason.length > 0, "la línea debe explicar por qué se clasifica así");
  assert.equal(line.counted, true);
});

test("el CSV incluye todas las líneas y una fila de cierre con el saldo", () => {
  const report = buildReconciliation(
    world({
      campaigns: [{ id: 1, title: "C", status: "active", isDemo: false, raised: 0 }],
      donations: [donation(1, 1, 1000)],
      expenses: [expense(1, 1, 250)],
    }),
  );
  const rows = reconciliationCsvRows(report);
  assert.equal(rows.length, 3, "donación + gasto + cierre");
  const closing = rows[rows.length - 1];
  assert.equal(closing.figura, "SALDO PUBLICADO");
  assert.equal(closing.importe, 750);
  assert.match(closing.evidencia, /recaudación 1000 − gastos 250/);
});

test("con el filtro de estado, el fondo general queda fuera (no tiene estado)", () => {
  const report = buildReconciliation(
    world({
      campaigns: [{ id: 1, title: "C", status: "active", isDemo: false, raised: 0 }],
      donations: [donation(1, 1, 100), donation(2, null, 900)],
    }),
    { statusFilter: "active" },
  );
  assert.equal(report.summary.verifiedRaised, 100);
});

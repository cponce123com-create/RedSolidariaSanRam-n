// Purga definitiva de campañas DEMO (V7.2) — presentación PURA del panel.
//
// Regresión cubierta: la interfaz NO decide el borrado. Muestra el análisis del
// servidor, no habilita la confirmación si hay bloqueos y nunca presenta una
// operación destructiva como «lista» cuando el veredicto dice lo contrario.
import { test } from "node:test";
import assert from "node:assert/strict";

const {
  MIN_DEMO_REASON,
  affectedTables,
  blockerSummary,
  canPurgeDemoCampaign,
  demoPurgeHeadline,
  demoPurgeSteps,
  demoPurgeSummary,
  describeLedger,
  describePlan,
  identifierMatches,
  needsDemoMarking,
  shortHash,
  shouldOpenAfterMenuClose,
  totalOfPlan,
} = await import("./dist/campaign-demo-purge.mjs");

const plan = (entries) =>
  entries.map(([table, label, count]) => ({ table, label, count }));

const verdict = (overrides = {}) => ({
  allowed: true,
  requiresDemoMarking: false,
  blockers: [],
  warnings: [],
  deletionPlan: plan([
    ["campaign_movements", "Movimientos contables de prueba", 2],
    ["donations", "Donaciones ficticias", 5],
    ["campaigns", "Campaña", 1],
  ]),
  unlinkPlan: plan([
    ["community_reports", "Reportes ciudadanos", 0],
    ["certificates", "Certificados emitidos", 1],
    ["volunteer_participations", "Participaciones del voluntariado", 0],
  ]),
  preserved: plan([
    ["donors", "Perfiles de donante", 0],
    ["volunteers", "Voluntariado y equipos", 0],
    ["news", "Noticias generales", 0],
  ]),
  affectedChains: [],
  totalRecords: 8,
  ...overrides,
});

const analysis = (overrides = {}) => ({
  campaign: {
    id: 7,
    title: "Rescate Animal San Ramón",
    status: "active",
    isDemo: true,
    demoMarkedAt: "2026-10-01T10:00:00.000Z",
    demoMarkedBy: "superadmin",
  },
  counts: {},
  real: {
    reconciledDonations: 0,
    expensesWithReceipt: 0,
    leftoversWithFlow: 0,
    evidenceLinkedToLeftovers: 0,
    issuedCertificates: 1,
  },
  ledger: {
    movementCount: 2,
    chainVerified: true,
    brokenAt: null,
    rootHash: "a".repeat(64),
    foreignSources: [],
  },
  verdict: verdict(),
  ...overrides,
});

// ─── Decisión ────────────────────────────────────────────────────────────────

test("solo el superadmin puede purgar una campaña DEMO permitida", () => {
  assert.equal(canPurgeDemoCampaign(analysis(), "superadmin"), true);
  assert.equal(canPurgeDemoCampaign(analysis(), "administrador"), false);
  assert.equal(canPurgeDemoCampaign(analysis(), "moderador"), false);
  assert.equal(canPurgeDemoCampaign(analysis(), null), false);
  assert.equal(canPurgeDemoCampaign(null, "superadmin"), false);
  assert.equal(canPurgeDemoCampaign(undefined, "superadmin"), false);
});

test("ni el superadmin puede purgar si el servidor la bloqueó", () => {
  const blocked = analysis({
    verdict: verdict({ allowed: false, blockers: [{ code: "x", message: "hay dinero real" }] }),
  });
  assert.equal(canPurgeDemoCampaign(blocked, "superadmin"), false);
});

test("needsDemoMarking refleja el veredicto del servidor", () => {
  assert.equal(needsDemoMarking(analysis()), false);
  assert.equal(
    needsDemoMarking(analysis({ verdict: verdict({ allowed: false, requiresDemoMarking: true }) })),
    true,
  );
  assert.equal(needsDemoMarking(null), false);
});

// ─── Titulares ───────────────────────────────────────────────────────────────

test("el titular nunca invita a confirmar cuando hay bloqueos", () => {
  assert.equal(demoPurgeHeadline(analysis()), "Listo para eliminar definitivamente");
  assert.equal(
    demoPurgeHeadline(analysis({ verdict: verdict({ allowed: false, requiresDemoMarking: true }) })),
    "Falta declararla como campaña DEMO",
  );
  assert.equal(
    demoPurgeHeadline(
      analysis({
        verdict: verdict({
          allowed: false,
          blockers: [{ code: "reconciled_donations", message: "dinero real" }],
        }),
      }),
    ),
    "Purga bloqueada: hay datos que no se pueden destruir",
  );
  assert.equal(demoPurgeHeadline(null), "Analizando la campaña…");
});

// ─── Pasos ───────────────────────────────────────────────────────────────────

test("los pasos marcan el análisis como hecho y bloquean la confirmación si no se puede", () => {
  const steps = demoPurgeSteps(analysis(), "superadmin");
  assert.deepEqual(
    steps.map((step) => step.key),
    ["analyze", "mark", "confirm"],
  );
  assert.equal(steps[0].done, true);
  assert.equal(steps[1].done, true, "ya está declarada DEMO");
  assert.equal(steps[2].enabled, true, "el análisis permite confirmar");
});

test("si falta la declaración DEMO, el paso de marcado se habilita y el de confirmación no", () => {
  const steps = demoPurgeSteps(
    analysis({ verdict: verdict({ allowed: false, requiresDemoMarking: true }) }),
    "superadmin",
  );
  assert.equal(steps[1].done, false);
  assert.equal(steps[1].enabled, true);
  assert.equal(steps[2].enabled, false);
});

test("un administrador normal nunca ve habilitado el paso de declaración DEMO", () => {
  const steps = demoPurgeSteps(
    analysis({ verdict: verdict({ allowed: false, requiresDemoMarking: true }) }),
    "administrador",
  );
  assert.equal(steps[1].enabled, false);
  assert.equal(steps[2].enabled, false);
});

// ─── Resumen y descripciones ─────────────────────────────────────────────────

test("el resumen cuenta filas y tipos eliminables y lo desvinculado", () => {
  const summary = demoPurgeSummary(verdict());
  assert.deepEqual(summary, {
    deletableRows: 8,
    deletableTables: 3,
    unlinkedRows: 1,
    blockers: 0,
    warnings: 0,
  });
  assert.deepEqual(demoPurgeSummary(null), {
    deletableRows: 0,
    deletableTables: 0,
    unlinkedRows: 0,
    blockers: 0,
    warnings: 0,
  });
});

test("describePlan omite los tipos sin registros y usa las etiquetas del servidor", () => {
  assert.equal(
    describePlan(verdict().deletionPlan),
    "2 movimientos contables de prueba, 5 donaciones ficticias, 1 campaña",
  );
  assert.equal(describePlan([]), "");
  assert.equal(describePlan(undefined), "");
});

test("affectedTables y totalOfPlan ignoran lo que está a cero", () => {
  assert.deepEqual(affectedTables(verdict().deletionPlan), [
    "campaign_movements",
    "donations",
    "campaigns",
  ]);
  assert.equal(totalOfPlan(verdict().deletionPlan), 8);
  assert.equal(totalOfPlan(undefined), 0);
  // Un recuento negativo (dato corrupto) no resta del total.
  assert.equal(totalOfPlan(plan([["donations", "Donaciones ficticias", -5]])), 0);
});

test("blockerSummary destaca el bloqueo principal e informa de cuántos más hay", () => {
  assert.equal(blockerSummary([]), null);
  assert.equal(blockerSummary(undefined), null);
  assert.equal(
    blockerSummary([{ code: "a", message: "hay dinero real" }]),
    "hay dinero real",
  );
  assert.equal(
    blockerSummary([
      { code: "a", message: "hay dinero real" },
      { code: "b", message: "hay un documento" },
    ]),
    "hay dinero real (y 1 impedimento más)",
  );
  assert.equal(
    blockerSummary([
      { code: "a", message: "uno" },
      { code: "b", message: "dos" },
      { code: "c", message: "tres" },
    ]),
    "uno (y 2 impedimentos más)",
  );
});

// ─── Libro contable ──────────────────────────────────────────────────────────

test("describeLedger explica cada estado del libro contable", () => {
  assert.equal(
    describeLedger({ movementCount: 0, chainVerified: true, brokenAt: null, rootHash: null, foreignSources: [] }),
    "La campaña no tiene asientos en el libro contable.",
  );
  const broken = describeLedger({
    movementCount: 2,
    chainVerified: false,
    brokenAt: 41,
    rootHash: null,
    foreignSources: [],
  });
  assert.match(broken, /NO verifica/);
  assert.match(broken, /41/);
  assert.match(broken, /bloqueada/);
  const foreign = describeLedger({
    movementCount: 2,
    chainVerified: true,
    brokenAt: null,
    rootHash: "b".repeat(64),
    foreignSources: [{ movementId: 9, sourceType: "donation", sourceId: 1 }],
  });
  assert.match(foreign, /otra campaña/);
  const healthy = describeLedger({
    movementCount: 3,
    chainVerified: true,
    brokenAt: null,
    rootHash: "c".repeat(64),
    foreignSources: [],
  });
  assert.match(healthy, /copia íntegra/);
  assert.equal(describeLedger(null), "La campaña no tiene asientos en el libro contable.");
});

test("shortHash abrevia sin perder la posibilidad de comparar el inicio", () => {
  assert.equal(shortHash(null), "—");
  assert.equal(shortHash("abc"), "abc");
  assert.equal(shortHash("0123456789abcdef0123456789abcdef"), "0123456789ab…");
});

// ─── Confirmación local ──────────────────────────────────────────────────────

test("identifierMatches exige el identificador exacto (con espacios tolerados)", () => {
  assert.equal(identifierMatches("7", 7), true);
  assert.equal(identifierMatches("  7  ", 7), true);
  assert.equal(identifierMatches("8", 7), false);
  assert.equal(identifierMatches("", 7), false);
  assert.equal(identifierMatches("07", 7), false, "no se normalizan ceros a la izquierda");
});

test("el mínimo del motivo coincide con el que exige el servidor", () => {
  assert.equal(MIN_DEMO_REASON, 10);
});

// ─── Traspaso menú «Más acciones» → diálogo ──────────────────────────────────

test("el diálogo DEMO NO se abre mientras el menú sigue abierto", () => {
  // Regresión: abrirlo desde el onSelect del menú monta dos capas modales de
  // Radix en el mismo clic; el foco queda atrapado entre ellas y el `body` puede
  // quedarse con pointer-events:none (el diálogo se ve pero no responde a ningún
  // clic, así que no se podía declarar la campaña como DEMO).
  const pending = { id: 7, title: "Rescate Animal San Ramón" };
  assert.equal(
    shouldOpenAfterMenuClose(7, pending),
    false,
    "con el menú de la campaña 7 abierto no se abre el diálogo",
  );
  assert.equal(
    shouldOpenAfterMenuClose(9, pending),
    false,
    "tampoco si el menú abierto es el de otra campaña",
  );
});

test("el diálogo DEMO se abre una vez cerrado el menú y hay acción pendiente", () => {
  const pending = { id: 7, title: "Rescate Animal San Ramón" };
  assert.equal(shouldOpenAfterMenuClose(null, pending), true);
});

test("sin acción pendiente no se abre nada (clic en el menú y salir)", () => {
  assert.equal(shouldOpenAfterMenuClose(null, null), false);
  assert.equal(shouldOpenAfterMenuClose(7, null), false);
});

// Purga definitiva de campañas DEMO (V7.2) — lógica PURA.
//
// Regresión cubierta: la marca `is_demo` es condición NECESARIA pero NO
// SUFICIENTE. Aunque el superadmin declare una campaña como DEMO, el análisis
// BLOQUEA la purga si detecta dinero conciliado, documentos de gasto, bienes con
// flujo real, evidencias documentales o asientos ajenos a la campaña.
import { test } from "node:test";
import assert from "node:assert/strict";

// El módulo del ledger importa `@workspace/db` (crea el pool al cargarse): se
// define una URL ficticia, igual que el resto de tests, porque la verificación
// de la cadena es PURA y no llega a conectarse.
process.env.DATABASE_URL ??= "postgres://localhost:5432/nonexistent";

const {
  EMPTY_DEMO_PURGE_COUNTS,
  DEMO_PURGE_DELETABLE_TABLES,
  analyzeDemoPurge,
  buildDemoPurgeManifest,
  canonicalJson,
  extractLedgerRowsFromSnapshot,
  hashSnapshot,
  normalizeForHash,
  validateDemoMarkRequest,
  validateDemoPurgeRequest,
  verifyDemoPurgeManifest,
} = await import("./dist/lib/campaign-demo-purge.mjs");

const { GENESIS_PREV, computeMovementHash, verifyChain } = await import("./dist/lib/ledger.mjs");

const campaign = (overrides = {}) => ({
  id: 7,
  title: "Rescate Animal San Ramón",
  status: "active",
  isDemo: true,
  demoMarkedAt: "2026-10-01T10:00:00.000Z",
  demoMarkedBy: "superadmin",
  ...overrides,
});

const counts = (overrides = {}) => ({ ...EMPTY_DEMO_PURGE_COUNTS, campaigns: 1, ...overrides });

const real = (overrides = {}) => ({
  reconciledDonations: 0,
  expensesWithReceipt: 0,
  leftoversWithFlow: 0,
  evidenceLinkedToLeftovers: 0,
  issuedCertificates: 0,
  ...overrides,
});

const ledger = (overrides = {}) => ({
  movementCount: 0,
  chainVerified: true,
  brokenAt: null,
  rootHash: null,
  foreignSources: [],
  ...overrides,
});

const analyze = (overrides = {}) =>
  analyzeDemoPurge({
    campaign: campaign(),
    counts: counts(),
    real: real(),
    ledger: ledger(),
    ...overrides,
  });

const blockerCodes = (verdict) => verdict.blockers.map((b) => b.code);

// ─── Veredicto: camino feliz ─────────────────────────────────────────────────

test("campaña DEMO sin señales reales → purga permitida", () => {
  const verdict = analyze();
  assert.equal(verdict.allowed, true);
  assert.equal(verdict.requiresDemoMarking, false);
  assert.deepEqual(verdict.blockers, []);
  assert.equal(verdict.totalRecords, 1); // la propia campaña
});

test("sin la marca DEMO la purga se bloquea y se pide el paso previo", () => {
  const verdict = analyze({ campaign: campaign({ isDemo: false }) });
  assert.equal(verdict.allowed, false);
  assert.equal(verdict.requiresDemoMarking, true);
  assert.deepEqual(blockerCodes(verdict), ["demo_not_marked"]);
});

// ─── Veredicto: cada señal objetiva de datos reales bloquea ──────────────────

test("una donación conciliada con el banco bloquea la purga", () => {
  const verdict = analyze({ real: real({ reconciledDonations: 2 }) });
  assert.equal(verdict.allowed, false);
  assert.deepEqual(blockerCodes(verdict), ["reconciled_donations"]);
  assert.match(verdict.blockers[0].message, /dinero real/);
});

test("un gasto con documento de respaldo bloquea la purga", () => {
  const verdict = analyze({ real: real({ expensesWithReceipt: 1 }) });
  assert.deepEqual(blockerCodes(verdict), ["expenses_with_receipt"]);
  assert.match(verdict.blockers[0].message, /obligación de conservación/);
});

test("un bien con flujo real bloquea la purga", () => {
  const verdict = analyze({ real: real({ leftoversWithFlow: 3 }) });
  assert.deepEqual(blockerCodes(verdict), ["leftovers_with_flow"]);
});

test("una evidencia que prueba un bien entregado bloquea la purga", () => {
  const verdict = analyze({ real: real({ evidenceLinkedToLeftovers: 1 }) });
  assert.deepEqual(blockerCodes(verdict), ["evidence_documental"]);
});

test("los certificados emitidos NO bloquean: solo se desvinculan", () => {
  const verdict = analyze({
    counts: counts({ certificates: 4, community_reports: 2 }),
    real: real({ issuedCertificates: 4 }),
  });
  assert.equal(verdict.allowed, true);
  assert.equal(verdict.warnings.some((w) => w.code === "certificates_unlinked"), true);
  assert.equal(verdict.warnings.some((w) => w.code === "community_reports_unlinked"), true);
});

// ─── Veredicto: protección del libro contable ────────────────────────────────

test("una cadena que no verifica BLOQUEA la purga y no se borra ningún asiento", () => {
  const verdict = analyze({
    counts: counts({ campaign_movements: 2 }),
    ledger: ledger({ movementCount: 2, chainVerified: false, brokenAt: 41 }),
  });
  assert.equal(verdict.allowed, false);
  assert.deepEqual(blockerCodes(verdict), ["ledger_chain_broken"]);
  assert.match(verdict.blockers[0].message, /41/);
  assert.match(verdict.blockers[0].message, /NO se elimina ningún movimiento/);
});

test("un asiento cuyo origen es de OTRA campaña bloquea la purga", () => {
  const verdict = analyze({
    counts: counts({ campaign_movements: 1 }),
    ledger: ledger({
      movementCount: 1,
      chainVerified: true,
      rootHash: "abc",
      foreignSources: [{ movementId: 9, sourceType: "donation", sourceId: 555 }],
    }),
  });
  assert.equal(verdict.allowed, false);
  assert.deepEqual(blockerCodes(verdict), ["ledger_foreign_movements"]);
  assert.match(verdict.blockers[0].message, /#9 \(donation 555\)/);
});

test("cadena de prueba íntegra: se permite y se advierte de la copia previa", () => {
  const verdict = analyze({
    counts: counts({ campaign_movements: 3 }),
    ledger: ledger({ movementCount: 3, chainVerified: true, rootHash: "f".repeat(64) }),
  });
  assert.equal(verdict.allowed, true);
  const warning = verdict.warnings.find((w) => w.code === "ledger_chain_removed");
  assert.ok(warning, "debe avisar de que se elimina la cadena de prueba");
  assert.match(warning.message, /copia íntegra y el manifiesto/);
  assert.deepEqual(verdict.affectedChains, [
    { campaignId: 7, movements: 3, rootHash: "f".repeat(64), verified: true },
  ]);
});

test("varios bloqueos se acumulan (no se informa solo del primero)", () => {
  const verdict = analyze({
    campaign: campaign({ isDemo: false }),
    real: real({ reconciledDonations: 1, expensesWithReceipt: 2 }),
  });
  assert.equal(verdict.blockers.length, 3);
});

// ─── Plan de eliminación ─────────────────────────────────────────────────────

test("el plan elimina los asientos ANTES que la campaña (FK RESTRICT)", () => {
  const verdict = analyze({ counts: counts({ campaign_movements: 2, donations: 1 }) });
  const tables = verdict.deletionPlan.map((entry) => entry.table);
  assert.equal(tables[0], "campaign_movements");
  assert.equal(tables[tables.length - 1], "campaigns");
  assert.equal(
    tables.length,
    DEMO_PURGE_DELETABLE_TABLES.length,
    "el plan debe cubrir todas las tablas eliminables",
  );
  assert.ok(tables.indexOf("donation_proofs") < tables.indexOf("donations"));
  assert.ok(tables.indexOf("donations") < tables.indexOf("campaigns"));
});

test("el plan desvincula (conserva) reportes, certificados y participaciones", () => {
  const verdict = analyze({
    counts: counts({ community_reports: 1, certificates: 2, volunteer_participations: 3 }),
  });
  assert.deepEqual(
    verdict.unlinkPlan.map((entry) => entry.table),
    ["community_reports", "certificates", "volunteer_participations"],
  );
  assert.deepEqual(
    verdict.preserved.map((entry) => entry.table),
    ["donors", "volunteers", "news"],
  );
});

test("totalRecords suma el plan de eliminación y excluye lo desvinculado", () => {
  const verdict = analyze({
    counts: counts({ campaign_movements: 2, donations: 5, campaign_images: 3, community_reports: 9 }),
  });
  assert.equal(verdict.totalRecords, 1 + 2 + 5 + 3);
});

// ─── Validación de la petición de purga ──────────────────────────────────────

const validPurgeBody = (overrides = {}) => ({
  confirm: true,
  identifier: "7",
  reason: "datos de prueba cargados por error en la demo",
  password: "s3cret!",
  ...overrides,
});

test("validateDemoPurgeRequest exige confirmación explícita", () => {
  const result = validateDemoPurgeRequest(validPurgeBody({ confirm: undefined }), { id: 7 });
  assert.equal(result.ok, false);
  assert.equal(result.code, "confirmation_required");
});

test("validateDemoPurgeRequest exige escribir el identificador de la campaña", () => {
  const result = validateDemoPurgeRequest(validPurgeBody({ identifier: "8" }), { id: 7 });
  assert.equal(result.ok, false);
  assert.equal(result.code, "identifier_mismatch");
  assert.match(result.message, /\(7\)/);

  // El identificador se normaliza (espacios) pero no se "adivina".
  assert.equal(validateDemoPurgeRequest(validPurgeBody({ identifier: " 7 " }), { id: 7 }).ok, true);
});

test("validateDemoPurgeRequest exige un motivo suficientemente largo", () => {
  const result = validateDemoPurgeRequest(validPurgeBody({ reason: "corto" }), { id: 7 });
  assert.equal(result.ok, false);
  assert.equal(result.code, "reason_required");
});

test("validateDemoPurgeRequest exige la contraseña de reautenticación", () => {
  const result = validateDemoPurgeRequest(validPurgeBody({ password: "" }), { id: 7 });
  assert.equal(result.ok, false);
  assert.equal(result.code, "reauth_required");
});

test("validateDemoPurgeRequest acepta una petición completa", () => {
  const result = validateDemoPurgeRequest(validPurgeBody(), { id: 7 });
  assert.equal(result.ok, true);
  assert.equal(result.value.identifier, "7");
  assert.equal(result.value.reason, "datos de prueba cargados por error en la demo");
  assert.equal(result.value.totpCode, null);
});

test("validateDemoMarkRequest no exige identificador pero sí motivo y reautenticación", () => {
  const base = { confirm: true, reason: "campaña de demostración del inicio", password: "x" };
  assert.equal(validateDemoMarkRequest(base).ok, true);
  assert.equal(validateDemoMarkRequest({ ...base, confirm: undefined }).code, "confirmation_required");
  assert.equal(validateDemoMarkRequest({ ...base, reason: "no" }).code, "reason_required");
  assert.equal(validateDemoMarkRequest({ ...base, password: "" }).code, "reauth_required");
});

// ─── Respaldo verificable (snapshot + manifiesto) ────────────────────────────

test("normalizeForHash convierte fechas a ISO, ordena claves y unifica undefined", () => {
  const normalized = normalizeForHash({
    z: 1,
    a: new Date("2026-10-15T12:00:00.000Z"),
    b: undefined,
    c: [{ b: 2, a: 1 }],
  });
  assert.deepEqual(Object.keys(normalized), ["a", "b", "c", "z"]);
  assert.equal(normalized.a, "2026-10-15T12:00:00.000Z");
  assert.equal(normalized.b, null);
  assert.deepEqual(Object.keys(normalized.c[0]), ["a", "b"]);
});

test("canonicalJson es estable aunque cambie el orden de inserción de claves", () => {
  assert.equal(canonicalJson({ a: 1, b: { d: 4, c: 3 } }), canonicalJson({ b: { c: 3, d: 4 }, a: 1 }));
});

test("el hash del snapshot sobrevive al viaje de ida y vuelta por jsonb", () => {
  const snapshot = {
    generatedAt: "2026-10-15T12:00:00.000Z",
    campaign: { id: 7, createdAt: new Date("2026-01-02T03:04:05.000Z"), endDate: null },
    tables: { donations: [{ id: 1, amount: 150.5, createdAt: new Date("2026-02-03T00:00:00.000Z") }] },
  };
  const stored = JSON.parse(JSON.stringify(normalizeForHash(snapshot))); // jsonb: fechas → texto
  assert.equal(hashSnapshot(snapshot), hashSnapshot(stored));
});

test("buildDemoPurgeManifest sella el snapshot y verifyDemoPurgeManifest lo comprueba", () => {
  const snapshot = { generatedAt: "2026-10-15T12:00:00.000Z", tables: { donations: [{ id: 1 }] } };
  const manifest = buildDemoPurgeManifest({
    snapshot,
    campaignId: 7,
    campaignTitle: "Rescate Animal San Ramón",
    counts: counts({ donations: 1, campaign_movements: 2 }),
    ledger: { movements: 2, rootHash: "a".repeat(64), verified: true },
  });
  assert.equal(manifest.algorithm, "sha256");
  assert.equal(manifest.hash, hashSnapshot(snapshot));
  assert.equal(manifest.totalRecords, 4); // 1 campaña + 1 donación + 2 asientos
  assert.equal(verifyDemoPurgeManifest(snapshot, manifest.hash), true);
});

test("un respaldo manipulado NO verifica (sello SHA-256)", () => {
  const snapshot = { tables: { donations: [{ id: 1, amount: 100 }] } };
  const manifest = buildDemoPurgeManifest({
    snapshot,
    campaignId: 7,
    campaignTitle: "Demo",
    counts: counts(),
    ledger: { movements: 0, rootHash: null, verified: true },
  });
  const tampered = { tables: { donations: [{ id: 1, amount: 999 }] } };
  assert.equal(verifyDemoPurgeManifest(tampered, manifest.hash), false);
});

test("el respaldo permite reconstruir y verificar la cadena eliminada", () => {
  const base = {
    kind: "ingreso",
    amount: 150.5,
    description: "Donación ficticia",
    sourceType: "donation",
    sourceId: 1,
    createdAt: new Date("2026-02-03T00:00:00.000Z"),
  };
  const hash = computeMovementHash(GENESIS_PREV, base);
  const rows = [{ id: 1, ...base, prevHash: GENESIS_PREV, hash }];

  // El snapshot guarda las fechas como TEXTO (jsonb): se simula el viaje.
  const stored = JSON.parse(JSON.stringify(normalizeForHash(rows)));
  const extracted = extractLedgerRowsFromSnapshot({ tables: { campaign_movements: stored } });
  assert.equal(extracted.length, 1);

  // Rehidratando las fechas, la cadena del respaldo VERIFICA igual que en la base
  // (estrategia de reconstrucción verificable exigida para el libro contable).
  const rehydrated = extracted.map((row) => ({ ...row, createdAt: new Date(row.createdAt) }));
  assert.equal(verifyChain(rehydrated).verified, true);
  assert.equal(verifyChain(rehydrated).rootHash, hash);

  // Un respaldo sin asientos no inventa filas.
  assert.deepEqual(extractLedgerRowsFromSnapshot({}), []);
  assert.deepEqual(extractLedgerRowsFromSnapshot(null), []);
});

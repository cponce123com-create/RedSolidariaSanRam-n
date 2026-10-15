// Clasificación de datos DEMO (V9.1) — lógica PURA.
//
// Regla que estas pruebas blindan: NO se clasifica como DEMO un registro por
// pertenecer a una campaña antigua. Hace falta evidencia positiva (declaración
// DEMO explícita o firma de relleno documentada). Y la protección de ChocoFest se
// resuelve por ID, no por nombre.
import { test } from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL ??= "postgres://localhost:5432/nonexistent";

const {
  classifyDemoData,
  findProtectedCandidates,
  isOwnDocument,
  isPlaceholderMedia,
  isProtectedCampaign,
  parseProtectedCampaignIds,
} = await import("./dist/lib/demo-classification.mjs");

const UNSPLASH = "https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=600&q=80";
const CLOUDINARY_DEMO = "https://res.cloudinary.com/demo/image/upload/v1/boleta.jpg";
const OWN_DOCUMENT = "https://res.cloudinary.com/redsolidaria/image/upload/v1/boleta-real.jpg";

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

// ─── Medios de relleno ───────────────────────────────────────────────────────

test("los servicios de imágenes de ejemplo se reconocen como relleno", () => {
  assert.equal(isPlaceholderMedia(UNSPLASH), true);
  assert.equal(isPlaceholderMedia("https://picsum.photos/seed/x/600"), true);
  assert.equal(isPlaceholderMedia("https://placehold.co/600x400"), true);
  // La nube DEMO de Cloudinary tampoco es un documento de la organización.
  assert.equal(isPlaceholderMedia(CLOUDINARY_DEMO), true);
});

test("un documento del almacenamiento propio NO es relleno", () => {
  assert.equal(isPlaceholderMedia(OWN_DOCUMENT), false);
  assert.equal(isOwnDocument(OWN_DOCUMENT), true);
  assert.equal(isOwnDocument(UNSPLASH), false);
});

test("vacío o nulo no es relleno ni documento", () => {
  for (const value of [null, undefined, "", "   "]) {
    assert.equal(isPlaceholderMedia(value), false, `placeholder(${JSON.stringify(value)})`);
    assert.equal(isOwnDocument(value), false, `documento(${JSON.stringify(value)})`);
  }
});

// ─── Campañas ────────────────────────────────────────────────────────────────

test("una campaña antigua NO se clasifica DEMO sin evidencia (regla central)", () => {
  const { records } = classifyDemoData(
    world({
      campaigns: [
        { id: 1, title: "Campaña Escolar 2025", status: "archived", isDemo: false, raised: 2100 },
        { id: 2, title: "Techado para Familias", status: "completed", isDemo: false, raised: 12000 },
      ],
    }),
  );
  for (const id of [1, 2]) {
    const campaign = records.find((r) => r.table === "campaigns" && r.id === id);
    assert.equal(campaign?.classification, "pending", `campaña ${id}`);
  }
  assert.match(
    records.find((r) => r.id === 1)?.reasons.join(" ") ?? "",
    /no se clasifica como DEMO por ser antigua/,
  );
  assert.match(
    records.find((r) => r.id === 2)?.reasons.join(" ") ?? "",
    /requiere decisión del superadmin/,
  );
});

test("la declaración DEMO explícita sí clasifica la campaña como DEMO", () => {
  const { records } = classifyDemoData(
    world({ campaigns: [{ id: 7, title: "Pruebas", status: "active", isDemo: true, raised: 0 }] }),
  );
  assert.equal(records.find((r) => r.table === "campaigns" && r.id === 7)?.classification, "demo");
});

test("una campaña protegida queda protegida aunque esté declarada DEMO", () => {
  const { records } = classifyDemoData(
    world({
      protectedCampaignIds: [3],
      campaigns: [{ id: 3, title: "Chocofest 2025", status: "active", isDemo: true, raised: 2818.5 }],
    }),
  );
  assert.equal(
    records.find((r) => r.table === "campaigns" && r.id === 3)?.classification,
    "protected",
  );
});

test("una campaña con dinero conciliado se clasifica REAL", () => {
  const { records } = classifyDemoData(
    world({
      campaigns: [{ id: 2, title: "Real", status: "active", isDemo: false, raised: 0 }],
      donations: [
        {
          id: 10,
          campaignId: 2,
          amount: 500,
          status: "reconciled",
          email: "a@b.c",
          reconciledAt: new Date(),
          receiptUrl: null,
          createdAt: new Date(),
        },
      ],
    }),
  );
  assert.equal(records.find((r) => r.table === "campaigns" && r.id === 2)?.classification, "real");
});

// ─── Donaciones y gastos ─────────────────────────────────────────────────────

test("las donaciones heredan la clasificación de su campaña", () => {
  const { records } = classifyDemoData(
    world({
      campaigns: [
        { id: 1, title: "DEMO", status: "active", isDemo: true, raised: 0 },
        { id: 2, title: "Antigua", status: "completed", isDemo: false, raised: 0 },
      ],
      donations: [
        { id: 1, campaignId: 1, amount: 100, status: "approved", email: "x@y.z", reconciledAt: null, receiptUrl: null, createdAt: new Date() },
        { id: 2, campaignId: 2, amount: 200, status: "approved", email: "x@y.z", reconciledAt: null, receiptUrl: null, createdAt: new Date() },
        { id: 3, campaignId: 2, amount: 300, status: "reconciled", email: "x@y.z", reconciledAt: new Date(), receiptUrl: null, createdAt: new Date() },
      ],
    }),
  );
  assert.equal(records.find((r) => r.table === "donations" && r.id === 1)?.classification, "demo");
  assert.equal(records.find((r) => r.table === "donations" && r.id === 2)?.classification, "pending");
  assert.equal(records.find((r) => r.table === "donations" && r.id === 3)?.classification, "real");
});

test("un comprobante de RELLENO no convierte un gasto DEMO en bloqueante", () => {
  const { records } = classifyDemoData(
    world({
      campaigns: [{ id: 1, title: "DEMO", status: "active", isDemo: true, raised: 0 }],
      expenses: [
        { id: 5, campaignId: 1, description: "kits", amount: 1500, date: "2025-01-28", receiptUrl: UNSPLASH },
      ],
    }),
  );
  const expense = records.find((r) => r.table === "campaign_expenses" && r.id === 5);
  assert.equal(expense?.classification, "demo");
  assert.match(expense?.reasons.join(" ") ?? "", /medio de RELLENO/);
});

test("un gasto con documento PROPIO se clasifica REAL (obligación de conservación)", () => {
  const { records } = classifyDemoData(
    world({
      campaigns: [{ id: 2, title: "Antigua", status: "completed", isDemo: false, raised: 0 }],
      expenses: [
        { id: 6, campaignId: 2, description: "boleta", amount: 300, date: "2025-02-01", receiptUrl: OWN_DOCUMENT },
      ],
    }),
  );
  assert.equal(
    records.find((r) => r.table === "campaign_expenses" && r.id === 6)?.classification,
    "real",
  );
});

// ─── Protección por ID ───────────────────────────────────────────────────────

test("se resuelven candidatas a proteger por patrón y año", () => {
  const candidates = findProtectedCandidates([
    { id: 3, title: "Chocofest 2025" },
    { id: 9, title: "ChocoFest 2026" },
    { id: 4, title: "Campaña Escolar 2025" },
    { id: 5, title: "Chocolatada 2024" },
  ]);
  assert.deepEqual(
    candidates.map((c) => c.id),
    [3, 9],
  );
});

test("la protección se consulta por ID, no por nombre", () => {
  assert.equal(isProtectedCampaign(3, [3, 9]), true);
  assert.equal(isProtectedCampaign(4, [3, 9]), false);
  assert.equal(isProtectedCampaign(3, []), false);
});

test("la lista de IDs protegidos se lee de forma tolerante", () => {
  assert.deepEqual(parseProtectedCampaignIds("3,1,3"), [1, 3]);
  assert.deepEqual(parseProtectedCampaignIds(""), []);
  assert.deepEqual(parseProtectedCampaignIds(null), []);
  assert.deepEqual(parseProtectedCampaignIds("abc,0,-2"), []);
});

// ─── Registros compartidos ───────────────────────────────────────────────────

test("un donante que aporta en varias campañas queda PROTEGIDO", () => {
  const donation = (id, campaignId) => ({
    id,
    campaignId,
    amount: 50,
    status: "approved",
    email: "compartido@ejemplo.com",
    reconciledAt: null,
    receiptUrl: null,
    createdAt: new Date(),
  });
  const { records } = classifyDemoData(
    world({
      campaigns: [
        { id: 1, title: "DEMO", status: "active", isDemo: true, raised: 0 },
        { id: 3, title: "Chocofest 2025", status: "active", isDemo: false, raised: 0 },
      ],
      protectedCampaignIds: [3],
      donations: [donation(1, 1), donation(2, 3)],
      donors: [{ id: 1, name: "Compartido", email: "compartido@ejemplo.com" }],
    }),
  );
  const donor = records.find((r) => r.table === "donors" && r.id === 1);
  assert.equal(donor?.classification, "protected");
  assert.match(donor?.reasons.join(" ") ?? "", /compartido, nunca se borra/);
});

test("una mascota con solicitudes de adopción no se borra; una de relleno es DEMO", () => {
  const { records } = classifyDemoData(
    world({
      pets: [
        { id: 1, name: "Rex", status: "available", photos: [UNSPLASH] },
        { id: 2, name: "Luna", status: "available", photos: [UNSPLASH] },
        { id: 3, name: "Nube", status: "available", photos: [OWN_DOCUMENT] },
      ],
      adoptionRequests: [{ id: 1, petId: 2, status: "pending" }],
    }),
  );
  assert.equal(records.find((r) => r.table === "pets" && r.id === 1)?.classification, "demo");
  assert.equal(records.find((r) => r.table === "pets" && r.id === 2)?.classification, "protected");
  assert.equal(records.find((r) => r.table === "pets" && r.id === 3)?.classification, "pending");
});

test("un certificado emitido se protege (se revoca, no se borra)", () => {
  const { records } = classifyDemoData(
    world({
      certificates: [
        { id: 1, code: "CERT-1", status: "issued", campaignId: 1 },
        { id: 2, code: "CERT-2", status: "draft", campaignId: 1 },
      ],
    }),
  );
  assert.equal(records.find((r) => r.table === "certificates" && r.id === 1)?.classification, "protected");
  assert.equal(records.find((r) => r.table === "certificates" && r.id === 2)?.classification, "pending");
});

test("un asiento huérfano se marca como pendiente, nunca como DEMO", () => {
  const { records } = classifyDemoData(
    world({
      campaigns: [{ id: 2, title: "Antigua", status: "completed", isDemo: false, raised: 0 }],
      movements: [
        { id: 1, campaignId: 2, kind: "ingreso", amount: 100, sourceType: "donation", sourceId: 999 },
      ],
    }),
  );
  const movement = records.find((r) => r.table === "campaign_movements" && r.id === 1);
  assert.equal(movement?.classification, "pending");
  assert.match(movement?.reasons.join(" ") ?? "", /HUÉRFANO/);
});

test("el inventario resume por tabla y clasificación", () => {
  const inventory = classifyDemoData(
    world({
      protectedCampaignIds: [3],
      campaigns: [
        { id: 3, title: "Chocofest 2025", status: "active", isDemo: false, raised: 2818.5 },
        { id: 7, title: "DEMO", status: "active", isDemo: true, raised: 0 },
      ],
    }),
  );
  const campaignRow = inventory.byTable.find((row) => row.table === "campaigns");
  assert.equal(campaignRow?.total, 2);
  assert.equal(campaignRow?.protected, 1);
  assert.equal(campaignRow?.demo, 1);
  assert.deepEqual(
    inventory.protectedCampaigns.map((c) => c.id),
    [3],
  );
  assert.deepEqual(
    inventory.declaredDemoCampaigns.map((c) => c.id),
    [7],
  );
});

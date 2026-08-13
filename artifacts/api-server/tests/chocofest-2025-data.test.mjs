// Integridad de los datos reales de Chocofest 2025 (extraídos del informe en
// vivo de donaciones, Google Sheets → chocolatada2025.csv). Contratos puros, sin
// DB: si la fuente cambia, estos tests lo detectan antes de llegar al seed.
import { test } from "node:test";
import assert from "node:assert/strict";

const {
  CHOCOLATADA_2025_CAMPAIGN,
  CHOCOLATADA_2025_CASH_TOTAL,
  CHOCOLATADA_2025_DONATIONS,
  CHOCOLATADA_2025_EVIDENCE,
  CHOCOLATADA_2025_EXPENSES,
  CHOCOLATADA_2025_EXPENSES_TOTAL,
  CHOCOLATADA_2025_IMAGES,
  CHOCOLATADA_2025_LEFTOVERS,
  CHOCOLATADA_2025_TITLE,
  CHOCOLATADA_2025_UPDATES,
} = await import("./dist/lib/chocofest-2025-data.mjs");

test("chocofest: hay 52 donaciones registradas en la hoja", () => {
  assert.equal(CHOCOLATADA_2025_DONATIONS.length, 52);
});

test("chocofest: el total en efectivo coincide con la hoja (S/ 2,818.5)", () => {
  const cashTotal = CHOCOLATADA_2025_DONATIONS.reduce((sum, d) => sum + d.amount, 0);
  assert.equal(Math.round(cashTotal * 10) / 10, CHOCOLATADA_2025_CASH_TOTAL);
  assert.equal(CHOCOLATADA_2025_CASH_TOTAL, 2818.5);
});

test("chocofest: las donaciones en especie se registran sin monto y con su ítem", () => {
  const inKind = CHOCOLATADA_2025_DONATIONS.filter((d) =>
    d.message?.startsWith("Donación en especie: "),
  );
  assert.ok(inKind.length > 0, "debe haber donaciones en especie");
  for (const d of inKind) {
    assert.equal(d.amount, 0, `la especie de ${d.firstName} no se monetiza`);
    assert.equal(d.paymentMethod, "other");
    assert.ok(d.message && d.message.length > 20);
  }
});

test("chocofest: toda donación aprobada con fecha válida de diciembre 2025", () => {
  for (const d of CHOCOLATADA_2025_DONATIONS) {
    assert.equal(d.status, "approved");
    assert.ok(d.firstName.trim().length > 0, "nombre requerido");
    assert.ok(d.email, "email placeholder requerido");
    assert.ok(!Number.isNaN(new Date(d.createdAt).getTime()), "fecha inválida");
    assert.equal(new Date(d.createdAt).toISOString().slice(0, 7), "2025-12");
  }
});

test("chocofest: la campaña refleja la meta y el total real de la hoja", () => {
  assert.equal(CHOCOLATADA_2025_CAMPAIGN.title, CHOCOLATADA_2025_TITLE);
  assert.equal(CHOCOLATADA_2025_CAMPAIGN.goal, 2000); // Objetivo: S/. 2,000
  assert.equal(CHOCOLATADA_2025_CAMPAIGN.raised, CHOCOLATADA_2025_CASH_TOTAL);
});

test("chocofest: los gastos suman exactamente lo rendido (S/ 2,912.8)", () => {
  const total = CHOCOLATADA_2025_EXPENSES.reduce((sum, e) => sum + e.amount, 0);
  assert.equal(Math.round(total * 100) / 100, CHOCOLATADA_2025_EXPENSES_TOTAL);
  assert.equal(CHOCOLATADA_2025_EXPENSES_TOTAL, 2912.8);
  assert.equal(CHOCOLATADA_2025_EXPENSES.length, 15);
});

test("chocofest: los gastos son públicos, con fecha y categoría válidas", () => {
  for (const e of CHOCOLATADA_2025_EXPENSES) {
    assert.equal(e.isPublic, true);
    assert.ok(e.description.trim().length > 0);
    assert.ok(e.category.length > 0, "categoría requerida");
    assert.match(e.date, /^2025-12-\d{2}$/, `fecha inválida: ${e.date}`);
    assert.ok(e.amount > 0, `monto debe ser positivo: ${e.description}`);
  }
});

test("chocofest: evidencias demo con boletas/sustentos (purchase) y actividades", () => {
  const purchases = CHOCOLATADA_2025_EVIDENCE.filter((e) => e.evidenceType === "purchase");
  const activities = CHOCOLATADA_2025_EVIDENCE.filter((e) => e.evidenceType === "activity");
  assert.ok(purchases.length >= 4, "debe haber boletas/sustentos demo");
  assert.ok(activities.length >= 3, "debe haber evidencias de actividad");
  for (const e of CHOCOLATADA_2025_EVIDENCE) {
    assert.equal(e.isPublic, true);
    assert.ok(e.mediaUrl.startsWith("https://"), "media demo https");
    assert.equal(e.mediaType, "image");
  }
});

test("chocofest: contenido de transparencia presente y sobrantes vacíos por ahora", () => {
  assert.ok(CHOCOLATADA_2025_UPDATES.length >= 2);
  assert.ok(CHOCOLATADA_2025_IMAGES.length >= 3);
  assert.equal(CHOCOLATADA_2025_LEFTOVERS.length, 0); // se llenan desde el admin
});

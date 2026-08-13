// Integridad de los datos reales de la Chocolatada Navideña 2024 (extraídos
// del informe en vivo de donaciones, Google Sheets). Contratos puros, sin DB:
// si la fuente cambia, estos tests lo detectan antes de llegar al seed.
import { test } from "node:test";
import assert from "node:assert/strict";

const {
  CHOCOLATADA_2024_CAMPAIGN,
  CHOCOLATADA_2024_CASH_TOTAL,
  CHOCOLATADA_2024_DONATIONS,
  CHOCOLATADA_2024_TITLE,
} = await import("./dist/lib/chocolatada-2024-data.mjs");

test("chocolatada: hay 52 donaciones registradas en la hoja", () => {
  assert.equal(CHOCOLATADA_2024_DONATIONS.length, 52);
});

test("chocolatada: el total en efectivo coincide con la hoja (S/ 2,818.5)", () => {
  const cashTotal = CHOCOLATADA_2024_DONATIONS.reduce((sum, d) => sum + d.amount, 0);
  assert.equal(Math.round(cashTotal * 10) / 10, CHOCOLATADA_2024_CASH_TOTAL);
  assert.equal(CHOCOLATADA_2024_CASH_TOTAL, 2818.5);
});

test("chocolatada: las donaciones en especie se registran sin monto y con su ítem", () => {
  const inKind = CHOCOLATADA_2024_DONATIONS.filter((d) =>
    d.message?.startsWith("Donación en especie: "),
  );
  assert.ok(inKind.length > 0, "debe haber donaciones en especie");
  for (const d of inKind) {
    assert.equal(d.amount, 0, `la especie de ${d.firstName} no se monetiza`);
    assert.equal(d.paymentMethod, "other");
    assert.ok(d.message && d.message.length > 20);
  }
});

test("chocolatada: toda donación aprobada con fecha válida de diciembre 2025", () => {
  for (const d of CHOCOLATADA_2024_DONATIONS) {
    assert.equal(d.status, "approved");
    assert.ok(d.firstName.trim().length > 0, "nombre requerido");
    assert.ok(d.email, "email placeholder requerido");
    assert.ok(!Number.isNaN(new Date(d.createdAt).getTime()), "fecha inválida");
    assert.equal(new Date(d.createdAt).toISOString().slice(0, 7), "2025-12");
  }
});

test("chocolatada: la campaña refleja la meta y el total real de la hoja", () => {
  assert.equal(CHOCOLATADA_2024_CAMPAIGN.title, CHOCOLATADA_2024_TITLE);
  assert.equal(CHOCOLATADA_2024_CAMPAIGN.goal, 2000); // Objetivo: S/. 2,000
  assert.equal(CHOCOLATADA_2024_CAMPAIGN.raised, CHOCOLATADA_2024_CASH_TOTAL);
});

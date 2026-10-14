// Rendición de resultados del evento (funciones puras, sin React ni red).
// Fase 4.3 del Prompt Maestro V7.
import { test } from "node:test";
import assert from "node:assert/strict";

const {
  RESULTS_SETTING_KEYS,
  assembleEventResults,
  parseBeneficiaries,
  summarizeGoodsFlow,
} = await import("./dist/event-results.mjs");

test("claves públicas de la rendición de resultados", () => {
  assert.deepEqual(RESULTS_SETTING_KEYS, {
    beneficiaries: "chocofest_2026_results_beneficiaries",
    activities: "chocofest_2026_results_activities",
    summary: "chocofest_2026_results_summary",
    leftoversDestination: "chocofest_2026_results_leftovers_destination",
  });
});

test("flujo de bienes: recibido, entregado y saldo con la regla del inventario", () => {
  const goods = summarizeGoodsFlow([
    { id: 1, item: "Juguetes", quantity: 80, receivedQty: 80, usedQty: 60 },
    { id: 2, item: "Chocolate", quantity: 30, receivedQty: 30, usedQty: 30 },
  ]);
  assert.equal(goods.lines, 2);
  assert.equal(goods.received, 110);
  assert.equal(goods.distributed, 90);
  assert.equal(goods.remaining, 20);
});

test("flujo de bienes: filas antiguas sin flujo cuentan como recibidas y no entregadas", () => {
  const goods = summarizeGoodsFlow([{ id: 1, item: "Víveres", quantity: 12 }]);
  assert.equal(goods.received, 12);
  assert.equal(goods.distributed, 0);
  assert.equal(goods.remaining, 12);
});

test("flujo de bienes: nunca resta por debajo de cero y tolera listas vacías", () => {
  const goods = summarizeGoodsFlow([{ id: 1, item: "Cobijas", quantity: 0, receivedQty: 5, usedQty: 9 }]);
  assert.equal(goods.remaining, 0);
  assert.deepEqual(summarizeGoodsFlow(undefined), { lines: 0, received: 0, distributed: 0, remaining: 0 });
  assert.deepEqual(summarizeGoodsFlow(null), { lines: 0, received: 0, distributed: 0, remaining: 0 });
});

test("beneficiarios: entero declarado, con separadores de miles", () => {
  assert.equal(parseBeneficiaries("320"), 320);
  assert.equal(parseBeneficiaries("1.250"), 1250);
  assert.equal(parseBeneficiaries(" 84 "), 84);
  assert.equal(parseBeneficiaries("0"), 0);
});

test("beneficiarios: lo no declarado o inválido es null (nunca un cero inventado)", () => {
  for (const raw of [undefined, null, "", "   ", "muchos", -5, {}, "abc"]) {
    assert.equal(parseBeneficiaries(raw), null);
  }
});

test("informe: cifras reales + datos declarados, sin sumar bienes al dinero", () => {
  const report = assembleEventResults({
    transparency: { totalRaised: 5000, totalSpent: 3200, balance: 1800 },
    inventory: [
      { id: 1, item: "Juguetes", quantity: 80, receivedQty: 80, usedQty: 60 },
      { id: 2, item: "Chocolate", quantity: 30, receivedQty: 30, usedQty: 30 },
    ],
    plannedActivities: [
      { time: "16:00", title: "Entrega de regalos", responsible: "Voluntarios" },
      { time: "17:00", title: "Chocolatada", responsible: "Cocina" },
    ],
    results: {
      [RESULTS_SETTING_KEYS.beneficiaries]: "250",
      [RESULTS_SETTING_KEYS.activities]: "16:00 | Entrega de regalos | Voluntarios",
      [RESULTS_SETTING_KEYS.summary]: "Se atendió a 250 niños y niñas.",
      [RESULTS_SETTING_KEYS.leftoversDestination]: "Los juguetes sobrantes pasan al inventario permanente.",
    },
  });

  assert.equal(report.money.income, 5000);
  assert.equal(report.money.spent, 3200);
  assert.equal(report.money.balance, 1800);
  assert.equal(report.money.available, true);
  assert.equal(report.goods.received, 110);
  assert.equal(report.goods.distributed, 90);
  assert.equal(report.goods.remaining, 20);
  assert.equal(report.activities.planned, 2);
  assert.equal(report.activities.done, 1);
  assert.equal(report.activities.doneList[0].title, "Entrega de regalos");
  assert.equal(report.beneficiaries, 250);
  assert.match(report.summary, /250 niños/);
  assert.match(report.leftoversDestination, /inventario permanente/);
  assert.equal(report.hasAnything, true);
});

test("informe: sin datos no se inventa nada y la sección no se muestra", () => {
  const report = assembleEventResults({});
  assert.equal(report.money.income, null);
  assert.equal(report.money.available, false);
  assert.equal(report.beneficiaries, null);
  assert.equal(report.activities.done, 0);
  assert.equal(report.summary, "");
  assert.equal(report.hasAnything, false);
});

test("informe: el saldo se deriva si la transparencia no lo trae", () => {
  const report = assembleEventResults({ transparency: { totalRaised: "1000.50", totalSpent: "250.25" } });
  assert.equal(report.money.balance, 750.25);
});

test("informe: dinero sin transparencia cargada no rompe el informe", () => {
  const report = assembleEventResults({
    transparency: null,
    inventory: [{ id: 1, item: "Cobijas", quantity: 4 }],
    results: { [RESULTS_SETTING_KEYS.beneficiaries]: "12" },
  });
  assert.equal(report.money.available, false);
  assert.equal(report.goods.received, 4);
  assert.equal(report.beneficiaries, 12);
  assert.equal(report.hasAnything, true);
});

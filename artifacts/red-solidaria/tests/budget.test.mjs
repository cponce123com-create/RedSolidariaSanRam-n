// Presupuesto por categoría (funciones puras, sin red).
import { test } from "node:test";
import assert from "node:assert/strict";

const {
  UNBUDGETED_KEY,
  UNBUDGETED_LABEL,
  buildBudget,
  campaignBalance,
  categoryKey,
} = await import("./dist/budget.mjs");

const line = (category, plannedAmount, extra = {}) => ({
  id: 1,
  campaignId: 1,
  category,
  plannedAmount,
  isPublic: true,
  ...extra,
});

test("categoryKey: ignora mayúsculas, acentos y espacios sobrantes", () => {
  assert.equal(categoryKey("Alimentos"), "alimentos");
  assert.equal(categoryKey("  ALIMENTOS  "), "alimentos");
  assert.equal(categoryKey("Alimentación"), "alimentacion");
  assert.equal(categoryKey("logística   y  transporte"), "logistica y transporte");
  assert.equal(categoryKey(null), "");
  assert.equal(categoryKey(7), "");
});

test("buildBudget: cruza gastos con su partida ignorando el formato", () => {
  const { rows, totals } = buildBudget(
    [line("Alimentos", 1000), line("Regalos", 500)],
    [
      { category: "alimentos", amount: 250 },
      { category: "Alimentos ", amount: 150 },
      { category: "Regalos", amount: 500 },
    ],
  );
  const alimentos = rows.find((r) => r.key === "alimentos");
  assert.equal(alimentos.planned, 1000);
  assert.equal(alimentos.spent, 400);
  assert.equal(alimentos.remaining, 600);
  assert.equal(alimentos.exceeded, false);
  assert.equal(alimentos.progress.percent, 40);

  const regalos = rows.find((r) => r.key === "regalos");
  assert.equal(regalos.spent, 500);
  assert.equal(regalos.remaining, 0);
  assert.equal(regalos.progress.reached, true);
  assert.equal(regalos.exceeded, false);

  assert.equal(totals.planned, 1500);
  assert.equal(totals.spent, 900);
  assert.equal(totals.remaining, 600);
  assert.equal(totals.unbudgetedSpent, 0);
  assert.equal(totals.exceededRows, 0);
});

test("buildBudget: marca las partidas excedidas con saldo negativo", () => {
  const { rows, totals } = buildBudget(
    [line("Difusión", 100)],
    [{ category: "difusion", amount: 175 }],
  );
  assert.equal(rows[0].remaining, -75);
  assert.equal(rows[0].exceeded, true);
  assert.equal(rows[0].progress.percent, 100); // nunca > 100
  assert.equal(totals.exceededRows, 1);
});

test("buildBudget: los gastos sin partida se muestran, no se esconden", () => {
  const { rows, totals } = buildBudget(
    [line("Alimentos", 100)],
    [
      { category: "Alimentos", amount: 50 },
      { category: "Transporte", amount: 30 },
      { category: null, amount: 20 },
    ],
  );
  const sinPartida = rows.find((r) => r.key === UNBUDGETED_KEY);
  assert.equal(sinPartida.category, UNBUDGETED_LABEL);
  assert.equal(sinPartida.planned, 0);
  assert.equal(sinPartida.spent, 50); // Transporte 30 + categoría vacía 20
  assert.equal(sinPartida.progress.hasTarget, false);
  assert.equal(totals.unbudgetedSpent, 50);
  // Va al final para que se vea y se pueda presupuestar.
  assert.equal(rows[rows.length - 1].key, UNBUDGETED_KEY);
});

test("buildBudget: ordena por monto previsto y tolera datos ausentes", () => {
  const { rows, totals } = buildBudget(
    [line("B", 10), line("A", 900), line("C", 100)],
    [],
  );
  assert.deepEqual(rows.map((r) => r.category), ["A", "C", "B"]);
  assert.equal(totals.planned, 1010);
  assert.equal(totals.spent, 0);

  const vacio = buildBudget(undefined, null);
  assert.deepEqual(vacio.rows, []);
  assert.deepEqual(vacio.totals, {
    planned: 0,
    spent: 0,
    remaining: 0,
    unbudgetedSpent: 0,
    exceededRows: 0,
  });
});

test("buildBudget: una partida sin meta no inventa porcentaje", () => {
  const { rows } = buildBudget([line("Imprevistos", 0)], [{ category: "Imprevistos", amount: 80 }]);
  assert.equal(rows[0].progress.hasTarget, false);
  assert.equal(rows[0].progress.percent, 0);
  assert.equal(rows[0].exceeded, false);
  assert.equal(rows[0].remaining, -80);
});

test("campaignBalance: saldo general y avance frente a la meta", () => {
  const conMeta = campaignBalance(1200, 450, 2000);
  assert.equal(conMeta.balance, 750);
  assert.equal(conMeta.goalProgress.percent, 60);
  assert.equal(conMeta.goalProgress.missing, 800);

  // Sin meta aprobada: no se inventa un porcentaje.
  const sinMeta = campaignBalance(300, 100, 0);
  assert.equal(sinMeta.balance, 200);
  assert.equal(sinMeta.goalProgress.hasTarget, false);
  assert.equal(sinMeta.goalProgress.percent, 0);

  // Gastar más que lo recaudado produce saldo negativo (no se oculta).
  assert.equal(campaignBalance(100, 250, null).balance, -150);
});

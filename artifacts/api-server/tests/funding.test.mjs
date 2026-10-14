// Conciliación de la recaudación (funciones puras, sin DB).
// Regla del Prompt Maestro V7 (Fase 3.1): nunca el máximo de dos cantidades;
// la cifra publicada es la suma de fuentes que NO se solapan.
import { test } from "node:test";
import assert from "node:assert/strict";

const { availableBalance, campaignFunding, roundMoney } = await import(
  "./dist/lib/funding.mjs"
);

test("sin datos: todo a cero y nada contado", () => {
  const f = campaignFunding(0, 0);
  assert.deepEqual(f, {
    verifiedRaised: 0,
    historicalRaised: 0,
    historicalCounted: false,
    reconciledRaised: 0,
  });
});

test("valores ausentes o corruptos no rompen ni inventan cifras", () => {
  for (const [historical, verified] of [
    [undefined, undefined],
    [null, null],
    ["", ""],
    ["no-es-un-numero", Number.NaN],
    [{}, []],
  ]) {
    const f = campaignFunding(historical, verified);
    assert.equal(f.reconciledRaised, 0);
    assert.equal(f.historicalCounted, false);
  }
});

test("con donaciones registradas, el histórico NO se suma (no hay duplicidad)", () => {
  // Caso real de los datos históricos: la campaña tiene 500 en donaciones
  // registradas y 5000 escritos a mano que YA las incluían. Publicar 5500
  // duplicaría el importe; publicar 5000 tapaba las donaciones verificables.
  const f = campaignFunding("5000.00", 500);
  assert.equal(f.verifiedRaised, 500);
  assert.equal(f.historicalRaised, 5000);
  assert.equal(f.historicalCounted, false);
  assert.equal(f.reconciledRaised, 500);
});

test("sin donaciones registradas, el histórico es la única fuente y cuenta", () => {
  const f = campaignFunding(300, 0);
  assert.equal(f.historicalCounted, true);
  assert.equal(f.reconciledRaised, 300);
});

test("el total conciliado nunca es el máximo de las dos cifras", () => {
  // max(5000, 500) = 5000; la regla correcta es 500 (verificado) y 300 cuando
  // el histórico es la única fuente.
  assert.equal(campaignFunding(5000, 500).reconciledRaised, 500);
  assert.equal(campaignFunding(300, 0).reconciledRaised, 300);
  assert.equal(campaignFunding(500, 300).reconciledRaised, 300);
});

test("importes negativos se normalizan a 0 (nunca restan recaudación)", () => {
  const f = campaignFunding(-1000, -50);
  assert.equal(f.historicalRaised, 0);
  assert.equal(f.verifiedRaised, 0);
  assert.equal(f.reconciledRaised, 0);
});

test("redondeo a céntimos: la suma de floats no deriva", () => {
  assert.equal(roundMoney(0.1 + 0.2), 0.3);
  assert.equal(campaignFunding(0, 0.1 + 0.2).reconciledRaised, 0.3);
  assert.equal(campaignFunding(0.005, 0).historicalRaised, 0.01);
});

test("invariante: conciliado = verificado + histórico contado", () => {
  const cases = [
    [0, 0],
    [5000, 500],
    [300, 0],
    [0, 120.5],
    [1000, 0],
  ];
  for (const [historical, verified] of cases) {
    const f = campaignFunding(historical, verified);
    const expected =
      f.verifiedRaised + (f.historicalCounted ? f.historicalRaised : 0);
    assert.equal(f.reconciledRaised, roundMoney(expected));
  }
});

test("saldo disponible: conciliado menos gastado, nunca negativo por gastos inválidos", () => {
  const f = campaignFunding(0, 1000);
  assert.equal(availableBalance(f, 250.75), 749.25);
  assert.equal(availableBalance(f, 1200), -200);
  assert.equal(availableBalance(f, -50), 1000);
  assert.equal(availableBalance(f, undefined), 1000);
});

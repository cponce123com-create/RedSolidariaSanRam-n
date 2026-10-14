// Los datasets históricos de 2024 y 2025 no pueden ser el mismo.
//
// Hallazgo V7-17 (2026-10-14): el bloque de donaciones de `chocolatada-2024-data`
// es una COPIA del de `chocofest-2025-data` (mismos donantes, mismos importes,
// mismo total S/. 2,818.5 y fechas de 2025 también en el fichero de 2024). La
// campaña de 2024 acaba publicando, por tanto, las donaciones de 2025.
//
// La prueba está marcada como **TODO** a propósito: deja constancia del problema
// en cada ejecución sin romper la suite, porque **no se puede arreglar sin la hoja
// real de 2024** (que no está en el repositorio) y este proyecto no inventa datos
// históricos. Cuando llegue esa fuente, se sustituye el bloque y esta prueba
// pasa a ser una comprobación normal.
import { test } from "node:test";
import assert from "node:assert/strict";

const { CHOCOLATADA_2024_DONATIONS, CHOCOLATADA_2024_CASH_TOTAL } = await import(
  "./dist/lib/chocolatada-2024-data.mjs"
);
const { CHOCOLATADA_2025_DONATIONS, CHOCOLATADA_2025_CASH_TOTAL } = await import(
  "./dist/lib/chocofest-2025-data.mjs"
);

/** Huella de un listado de donaciones: donante, importe y fecha. */
const fingerprint = (list) =>
  JSON.stringify(list.map((d) => [d.name, d.amount, String(d.date ?? "")]));

test(
  "las donaciones de la Chocolatada 2024 no deben ser las de ChocoFest 2025",
  { todo: "falta la hoja fuente real de 2024 (V7-17): hoy el bloque es una copia del de 2025" },
  () => {
    assert.notEqual(
      fingerprint(CHOCOLATADA_2024_DONATIONS),
      fingerprint(CHOCOLATADA_2025_DONATIONS),
    );
    assert.notEqual(CHOCOLATADA_2024_CASH_TOTAL, CHOCOLATADA_2025_CASH_TOTAL);
  },
);

test("el problema está acotado al bloque de donaciones (los gastos sí son distintos)", async () => {
  const { CHOCOLATADA_2024_EXPENSES } = await import("./dist/lib/chocolatada-2024-data.mjs");
  const { CHOCOLATADA_2025_EXPENSES } = await import("./dist/lib/chocofest-2025-data.mjs");

  // Esto SÍ se cumple hoy: los gastos y las evidencias de 2024 son propios, así que
  // la contaminación no alcanza a toda la campaña. Si algún día falla, el problema
  // sería más amplio de lo documentado.
  assert.notEqual(
    JSON.stringify(CHOCOLATADA_2024_EXPENSES.map((e) => [e.description, e.amount])),
    JSON.stringify(CHOCOLATADA_2025_EXPENSES.map((e) => [e.description, e.amount])),
  );
});

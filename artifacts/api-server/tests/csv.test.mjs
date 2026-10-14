// Generación de CSV: RFC 4180 + anti-inyección de fórmulas (funciones puras).
// Los caracteres de control se construyen con String.fromCharCode para no
// depender de secuencias de escape.
import { test } from "node:test";
import assert from "node:assert/strict";

const { CSV_BOM, csvFilename, escapeCsvValue, isFormulaInjection, toCsv, toCsvDocument } =
  await import("./dist/lib/csv.mjs");

const q = '"';
const LF = String.fromCharCode(10);
const CRLF = String.fromCharCode(13, 10);

test("escapeCsvValue: nulos, números y booleanos", () => {
  assert.equal(escapeCsvValue(null), "");
  assert.equal(escapeCsvValue(undefined), "");
  assert.equal(escapeCsvValue(12.5), "12.5");
  assert.equal(escapeCsvValue(true), "true");
  assert.equal(escapeCsvValue(false), "false");
  assert.equal(escapeCsvValue(Number.NaN), "");
  assert.equal(escapeCsvValue(Number.POSITIVE_INFINITY), "");
});

test("escapeCsvValue: entrecomilla separadores, comillas y saltos", () => {
  assert.equal(escapeCsvValue("Ramón, Ana"), `${q}Ramón, Ana${q}`);
  assert.equal(escapeCsvValue(`dijo ${q}hola${q}`), `${q}dijo ${q}${q}hola${q}${q}${q}`);
  assert.equal(escapeCsvValue(`linea1${LF}linea2`), `${q}linea1${LF}linea2${q}`);
  assert.equal(escapeCsvValue("simple"), "simple");
});

test("anti-inyección: detecta y neutraliza fórmulas al inicio", () => {
  assert.equal(isFormulaInjection("=1+1"), true);
  assert.equal(isFormulaInjection("+SUM(A1)"), true);
  assert.equal(isFormulaInjection("-2"), true);
  assert.equal(isFormulaInjection("@cmd"), true);
  assert.equal(isFormulaInjection("normal"), false);
  assert.equal(isFormulaInjection(""), false);

  // El nombre de un donante malicioso NO se evalúa al abrir el archivo.
  assert.equal(
    escapeCsvValue('=HYPERLINK("http://x")'),
    `${q}'=HYPERLINK(${q}${q}http://x${q}${q})${q}`,
  );
  assert.equal(escapeCsvValue("@SUM(1)"), "'@SUM(1)");
  // Un NÚMERO negativo no se toca: no es texto de fórmula.
  assert.equal(escapeCsvValue(-5), "-5");
});

test("toCsv: encabezado + filas con fin de línea CRLF", () => {
  const csv = toCsv(
    [
      { header: "id", value: (r) => r.id },
      { header: "nombre", value: (r) => r.name },
    ],
    [
      { id: 1, name: "Ana" },
      { id: 2, name: "Luis, Jr" },
    ],
  );
  assert.equal(csv, ["id,nombre", "1,Ana", `2,${q}Luis, Jr${q}`].join(CRLF));
  assert.equal(csv.includes(CRLF), true);
});

test("toCsv: sin filas devuelve solo el encabezado", () => {
  assert.equal(toCsv([{ header: "id", value: (r) => r.id }], []), "id");
});

test("toCsvDocument: antepone BOM para que Excel respete los acentos", () => {
  const doc = toCsvDocument([{ header: "id", value: (r) => r.id }], [{ id: 1 }]);
  assert.equal(doc, `${CSV_BOM}id${CRLF}1`);
  assert.equal(doc.startsWith(CSV_BOM), true);
});

test("csvFilename: fecha en formato AAAA-MM-DD y tolera fechas inválidas", () => {
  assert.equal(
    csvFilename("donaciones", new Date("2026-10-14T12:00:00Z")),
    "donaciones-2026-10-14.csv",
  );
  assert.equal(csvFilename("x", new Date("invalid")), "x-.csv");
});

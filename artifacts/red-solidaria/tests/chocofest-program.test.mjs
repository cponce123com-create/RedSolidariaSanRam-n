// Programa de actividades del evento (parser y serializador puros, sin red).
import { test } from "node:test";
import assert from "node:assert/strict";

// El salto de línea se construye en tiempo de ejecución: así el archivo no
// depende de secuencias escapadas dentro de literales y se mantiene legible.
const NL = String.fromCharCode(10);
const lines = (...items) => items.join(NL);

const { CHOCOFEST_PROGRAM_SETTING_KEY, parseProgram, serializeProgram } =
  await import("./dist/chocofest.mjs");

test("clave de configuración del programa: estable", () => {
  assert.equal(CHOCOFEST_PROGRAM_SETTING_KEY, "chocofest_2026_program");
});

test("parseProgram: hora, título y responsable", () => {
  const program = parseProgram(
    lines(
      "16:00 | Entrega de regalos | Equipo de voluntarios",
      "17:00 | Chocolatada | Equipo de cocina",
    ),
  );
  assert.deepEqual(program, [
    { time: "16:00", title: "Entrega de regalos", responsible: "Equipo de voluntarios" },
    { time: "17:00", title: "Chocolatada", responsible: "Equipo de cocina" },
  ]);
});

test("parseProgram: tolera líneas incompletas sin romper", () => {
  const program = parseProgram(
    lines(
      "4:00 p.m. | Bienvenida", // sin responsable
      "Entrega de víveres", // sin hora ni responsable
      "| Montaje del escenario | Logística", // sin hora
      "", // vacía
      "   ", // solo espacios
      "# comentario interno", // comentario
      "18:00 |", // sin título: se descarta
    ),
  );
  assert.deepEqual(program, [
    { time: "4:00 p.m.", title: "Bienvenida", responsible: "" },
    { time: "", title: "Entrega de víveres", responsible: "" },
    { time: "", title: "Montaje del escenario", responsible: "Logística" },
  ]);
});

test("parseProgram: nunca lanza con valores ausentes o basura", () => {
  assert.deepEqual(parseProgram(undefined), []);
  assert.deepEqual(parseProgram(null), []);
  assert.deepEqual(parseProgram(""), []);
  assert.deepEqual(parseProgram(lines("   ", "  ")), []);
  assert.deepEqual(parseProgram(123), []);
});

test("parseProgram: normaliza espacios y recorta longitudes", () => {
  const [activity] = parseProgram("  16:00   |   Entrega    de   regalos   |  Equipo   A  ");
  assert.deepEqual(activity, {
    time: "16:00",
    title: "Entrega de regalos",
    responsible: "Equipo A",
  });

  const [long] = parseProgram(`10:00 | ${"x".repeat(400)}`);
  assert.equal(long.title.length, 120);
});

test("parseProgram: limita el número de actividades", () => {
  const many = Array.from({ length: 60 }, (_, i) => `10:${i} | Actividad ${i}`);
  assert.equal(parseProgram(lines(...many)).length, 40);
});

test("serializeProgram: ida y vuelta estable", () => {
  const activities = [
    { time: "16:00", title: "Entrega de regalos", responsible: "Equipo A" },
    { time: "", title: "Cierre", responsible: "" },
  ];
  const text = serializeProgram(activities);
  assert.equal(text, lines("16:00 | Entrega de regalos | Equipo A", "Cierre"));
  assert.deepEqual(parseProgram(text), activities);
});

test("serializeProgram: tolera listas ausentes", () => {
  assert.equal(serializeProgram(undefined), "");
  assert.equal(serializeProgram(null), "");
  assert.equal(serializeProgram([]), "");
});

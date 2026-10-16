// Interpretación del resultado de un DELETE del panel (Fase 2 — eliminaciones
// seguras del Prompt Maestro).
//
// Regresión cubierta: el panel mostraba «eliminado» aunque la API hubiera
// respondido 404 (no se borró ninguna fila) o 409 (hay dependencias que lo
// bloquean). `fetch` resuelve igual en todos esos casos, así que el código HTTP
// debe traducirse a una decisión explícita.
import { test } from "node:test";
import assert from "node:assert/strict";

const {
  interpretDeleteStatus,
  describeDeleteOutcome,
  deleteOutcomeTitle,
  deleteOutcomeDescription,
} = await import("./dist/delete-outcome.mjs");

test("200/204 → borrado correcto", () => {
  for (const status of [200, 204]) {
    const outcome = interpretDeleteStatus(status);
    assert.equal(outcome.kind, "deleted");
    assert.equal(outcome.succeeded, true);
    assert.equal(outcome.canUnpublish, false);
  }
});

test("404 → no se borró nada (antes se mostraba un éxito falso)", () => {
  const outcome = interpretDeleteStatus(404);
  assert.equal(outcome.kind, "not_found");
  assert.equal(outcome.succeeded, false);
  assert.equal(outcome.canUnpublish, false);
});

test("409 → conflicto: se ofrece la alternativa no destructiva", () => {
  const outcome = interpretDeleteStatus(409);
  assert.equal(outcome.kind, "conflict");
  assert.equal(outcome.succeeded, false);
  assert.equal(outcome.canUnpublish, true);
});

test("401/403/500 → nunca éxito ni alternativa de despublicar", () => {
  for (const status of [401, 403, 500, 503]) {
    const outcome = interpretDeleteStatus(status);
    assert.equal(outcome.succeeded, false);
    assert.equal(outcome.canUnpublish, false);
  }
  assert.equal(interpretDeleteStatus(401).kind, "unauthorized");
  assert.equal(interpretDeleteStatus(403).kind, "forbidden");
  assert.equal(interpretDeleteStatus(500).kind, "server_error");
  assert.equal(interpretDeleteStatus(503).kind, "server_error");
});

test("describeDeleteOutcome usa el mensaje REAL del servidor cuando existe", () => {
  const info = describeDeleteOutcome(
    interpretDeleteStatus(409),
    "la mascota",
    "Esta mascota tiene 3 solicitud(es) de adopción. Resuélvelas antes de eliminarla.",
  );
  assert.equal(info.canUnpublish, true);
  assert.match(info.description, /3 solicitud/);
  assert.match(info.title, /No se puede eliminar la mascota/);
});

test("describeDeleteOutcome recurre al texto por defecto sin mensaje del servidor", () => {
  const info = describeDeleteOutcome(interpretDeleteStatus(404), "el aliado");
  assert.equal(info.canUnpublish, false);
  assert.match(info.title, /No se encontró el aliado/);
  assert.match(info.description, /ya se hubiera eliminado/);
});

test("títulos: el éxito capitaliza el sintagma de la entidad", () => {
  assert.equal(deleteOutcomeTitle("deleted", "la mascota"), "La mascota se eliminó correctamente");
  assert.equal(deleteOutcomeTitle("conflict", "el aliado"), "No se puede eliminar el aliado");
  assert.equal(deleteOutcomeTitle("unauthorized", "la noticia"), "Tu sesión expiró");
});

test("la descripción del éxito es vacía (no hay detalle que dar)", () => {
  assert.equal(deleteOutcomeDescription("deleted"), "");
});

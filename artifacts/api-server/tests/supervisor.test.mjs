// Supervisión: validación y matriz de permisos (funciones puras).
import { test } from "node:test";
import assert from "node:assert/strict";

const {
  OBSERVATION_ENTITY_TYPES,
  OBSERVATION_MAX_LENGTH,
  OBSERVATION_MIN_LENGTH,
  canResolveObservation,
  canWriteObservation,
  isObservationEntityType,
  observationEntityLabel,
  validateObservation,
} = await import("./dist/lib/supervisor.mjs");

test("tipos de registro observables", () => {
  assert.deepEqual(Object.values(OBSERVATION_ENTITY_TYPES).sort(), [
    "campaign",
    "donation",
    "donor",
    "movement",
  ]);
  assert.equal(isObservationEntityType("donation"), true);
  assert.equal(isObservationEntityType("nope"), false);
  assert.equal(isObservationEntityType(null), false);
  assert.equal(observationEntityLabel("movement"), "Movimiento contable");
  assert.equal(observationEntityLabel("otro"), "otro");
});

test("validateObservation: exige tipo, registro y cuerpo suficiente", () => {
  const badType = validateObservation({ entityType: "x", entityId: "1", body: "una observación" });
  assert.equal(badType.ok, false);
  assert.match(badType.message, /Tipo de registro/);

  const badId = validateObservation({ entityType: "donation", entityId: "", body: "una observación" });
  assert.equal(badId.ok, false);
  assert.match(badId.message, /registro observado/);

  const tooShort = validateObservation({ entityType: "donation", entityId: "1", body: "abc" });
  assert.equal(tooShort.ok, false);
  assert.match(tooShort.message, new RegExp(String(OBSERVATION_MIN_LENGTH)));

  const tooLong = validateObservation({
    entityType: "donation",
    entityId: "1",
    body: "x".repeat(OBSERVATION_MAX_LENGTH + 1),
  });
  assert.equal(tooLong.ok, false);
  assert.match(tooLong.message, new RegExp(String(OBSERVATION_MAX_LENGTH)));
});

test("validateObservation: normaliza (trim) el cuerpo y el registro", () => {
  const ok = validateObservation({
    entityType: "campaign",
    entityId: "  12  ",
    body: "  Falta el comprobante del gasto.  ",
  });
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.value, {
    entityType: "campaign",
    entityId: "12",
    body: "Falta el comprobante del gasto.",
  });
});

test("permisos: el supervisor ESCRIBE observaciones pero no las RESUELVE", () => {
  assert.equal(canWriteObservation("supervisor"), true);
  assert.equal(canWriteObservation("administrador"), true);
  assert.equal(canWriteObservation("superadmin"), true);
  assert.equal(canWriteObservation("moderador"), false);
  assert.equal(canWriteObservation(null), false);

  assert.equal(canResolveObservation("administrador"), true);
  assert.equal(canResolveObservation("superadmin"), true);
  // Resolver es competencia de la administración: el supervisor solo observa.
  assert.equal(canResolveObservation("supervisor"), false);
  assert.equal(canResolveObservation("moderador"), false);
});

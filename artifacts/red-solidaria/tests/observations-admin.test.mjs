// Observaciones de supervisión: URL y contadores (funciones puras).
import { test } from "node:test";
import assert from "node:assert/strict";

const {
  OBSERVATION_ENTITY_LABEL,
  OBSERVATION_ENTITY_TYPES,
  OBSERVATION_MIN_LENGTH,
  buildObservationsUrl,
  countPending,
  observationEntityLabel,
} = await import("./dist/observations-admin.mjs");

test("tipos observables y sus etiquetas", () => {
  assert.deepEqual([...OBSERVATION_ENTITY_TYPES], ["donation", "campaign", "movement", "donor"]);
  assert.equal(observationEntityLabel("donation"), "Donación");
  assert.equal(observationEntityLabel("movement"), "Movimiento contable");
  assert.equal(observationEntityLabel("otro"), "otro");
  assert.equal(OBSERVATION_ENTITY_LABEL.campaign, "Campaña");
  assert.equal(OBSERVATION_MIN_LENGTH, 5);
});

test("buildObservationsUrl: sin filtros devuelve la ruta base", () => {
  assert.equal(buildObservationsUrl(), "/api/admin/observations");
  assert.equal(buildObservationsUrl({}), "/api/admin/observations");
});

test("buildObservationsUrl: añade solo los filtros activos", () => {
  const url = buildObservationsUrl({
    entityType: "donation",
    entityId: "42",
    pending: true,
    limit: 50,
  });
  assert.match(url, /^\/api\/admin\/observations\?/);
  assert.match(url, /entityType=donation/);
  assert.match(url, /entityId=42/);
  assert.match(url, /pending=true/);
  assert.match(url, /limit=50/);
});

test("buildObservationsUrl: pending=false no se envía", () => {
  const url = buildObservationsUrl({ entityType: "campaign", pending: false });
  assert.match(url, /entityType=campaign/);
  assert.doesNotMatch(url, /pending/);
});

test("countPending: cuenta solo las no atendidas", () => {
  assert.equal(countPending(undefined), 0);
  assert.equal(countPending(null), 0);
  assert.equal(countPending([]), 0);
  assert.equal(
    countPending([{ resolved: false }, { resolved: true }, { resolved: false }]),
    2,
  );
});

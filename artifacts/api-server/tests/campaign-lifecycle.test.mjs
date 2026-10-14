import { test } from "node:test";
import assert from "node:assert/strict";

// Módulo puro: no importa la DB, se puede cargar directamente.
const {
  CAMPAIGN_STATUSES,
  HIDDEN_STATUSES,
  allowedTransitions,
  canTransition,
  deleteBlockReason,
  isCampaignStatus,
  isHiddenStatus,
  protagonistError,
  statusLabel,
  totalDependencies,
  transitionError,
} = await import("./dist/lib/campaign-lifecycle.mjs");

const deps = (overrides = {}) => ({
  donations: 0,
  movements: 0,
  expenses: 0,
  evidence: 0,
  leftovers: 0,
  images: 0,
  updates: 0,
  communityReports: 0,
  ...overrides,
});

test("estados válidos: se reconocen los cinco del ciclo de vida", () => {
  assert.deepEqual([...CAMPAIGN_STATUSES], [
    "draft",
    "active",
    "paused",
    "completed",
    "archived",
  ]);
  for (const s of CAMPAIGN_STATUSES) assert.equal(isCampaignStatus(s), true);
  assert.equal(isCampaignStatus("activo"), false);
  assert.equal(isCampaignStatus(null), false);
  assert.equal(isCampaignStatus(7), false);
});

test("estados ocultos al público: solo borrador y archivada", () => {
  assert.deepEqual([...HIDDEN_STATUSES], ["draft", "archived"]);
  assert.equal(isHiddenStatus("draft"), true);
  assert.equal(isHiddenStatus("archived"), true);
  assert.equal(isHiddenStatus("active"), false);
  assert.equal(isHiddenStatus("paused"), false);
  assert.equal(isHiddenStatus("completed"), false);
  assert.equal(isHiddenStatus(undefined), false);
});

test("transiciones permitidas del ciclo de vida", () => {
  // publicar / reanudar
  assert.equal(canTransition("draft", "active"), true);
  assert.equal(canTransition("paused", "active"), true);
  // pausar / finalizar
  assert.equal(canTransition("active", "paused"), true);
  assert.equal(canTransition("active", "completed"), true);
  assert.equal(canTransition("paused", "completed"), true);
  // despublicar
  assert.equal(canTransition("active", "draft"), true);
  assert.equal(canTransition("paused", "draft"), true);
  // reabrir
  assert.equal(canTransition("completed", "active"), true);
  // archivar / restaurar
  assert.equal(canTransition("draft", "archived"), true);
  assert.equal(canTransition("active", "archived"), true);
  assert.equal(canTransition("paused", "archived"), true);
  assert.equal(canTransition("completed", "archived"), true);
  assert.equal(canTransition("archived", "completed"), true);
});

test("archivar un borrador es la salida segura cuando tiene dependencias", () => {
  // Un borrador con dependencias NO puede eliminarse (destruiría historial) y
  // antes tampoco podía archivarse: quedaba atrapado. Ahora sí se archiva.
  const bloqueado = deleteBlockReason("draft", deps({ images: 3 }));
  assert.match(bloqueado, /Archívalo/);
  assert.equal(canTransition("draft", "archived"), true);
});

test("transiciones NO permitidas (se rechazan con 409 en la ruta)", () => {
  assert.equal(canTransition("draft", "completed"), false);
  assert.equal(canTransition("draft", "paused"), false);
  assert.equal(canTransition("archived", "active"), false); // restaurar → completed
  assert.equal(canTransition("archived", "draft"), false);
  assert.equal(canTransition("archived", "paused"), false);
  assert.equal(canTransition("completed", "paused"), false);
  assert.equal(canTransition("active", "active"), false); // no es una transición
  assert.equal(canTransition("inexistente", "active"), false);
});

test("allowedTransitions y mensajes accionables", () => {
  assert.deepEqual(allowedTransitions("draft"), ["active", "archived"]);
  assert.equal(allowedTransitions("inexistente").length, 0);
  const msg = transitionError("draft", "completed");
  assert.match(msg, /borrador/);
  assert.match(msg, /finalizada/);
  assert.equal(statusLabel("draft"), "borrador");
  assert.equal(statusLabel("otro"), "otro");
});

test("borrado permanente: solo borradores sin dependencias", () => {
  // Borrador limpio → permitido.
  assert.equal(deleteBlockReason("draft", deps()), null);
  // Borrador con cualquier dependencia → bloqueado.
  assert.match(deleteBlockReason("draft", deps({ movements: 1 })), /movimientos/);
  assert.match(deleteBlockReason("draft", deps({ donations: 2 })), /2 registro/);
  // Los reportes ciudadanos también cuentan: sin FK quedarían huérfanos.
  assert.match(deleteBlockReason("draft", deps({ communityReports: 1 })), /reportes/);
  // Cualquier estado que no sea borrador → bloqueado (debe archivarse).
  assert.match(deleteBlockReason("active", deps()), /archivarse/);
  assert.match(deleteBlockReason("completed", deps()), /archivarse/);
  assert.match(deleteBlockReason("archived", deps()), /archivarse/);
  assert.match(deleteBlockReason("paused", deps()), /archivarse/);
});

test("totalDependencies suma todas las fuentes", () => {
  assert.equal(totalDependencies(deps()), 0);
  assert.equal(totalDependencies(deps({ donations: 3, images: 2, updates: 1 })), 6);
  assert.equal(
    totalDependencies(deps({ movements: 1, communityReports: 2 })),
    3,
  );
});

test("protagonista de la portada: solo campañas visibles al público", () => {
  assert.equal(protagonistError("active"), null);
  assert.equal(protagonistError("paused"), null);
  assert.equal(protagonistError("completed"), null);
  assert.match(protagonistError("draft"), /borrador/);
  assert.match(protagonistError("archived"), /archivada/);
  // El mensaje debe indicar la salida, no solo el problema.
  assert.match(protagonistError("draft"), /Publícala/);
});

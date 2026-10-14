// Ciclo de vida del voluntariado (funciones puras, sin DB).
import { test } from "node:test";
import assert from "node:assert/strict";

const {
  VOLUNTEER_STATUSES,
  allowedTransitions,
  canTransition,
  isDecidedStatus,
  isVolunteerStatus,
  isValidVolunteerEmail,
  normalizeVolunteerEmail,
  requiresDecisionTrace,
  transitionError,
  volunteerStatusLabel,
} = await import("./dist/lib/volunteer-lifecycle.mjs");

test("estados y etiquetas del voluntariado", () => {
  assert.deepEqual([...VOLUNTEER_STATUSES], [
    "pending",
    "reviewing",
    "approved",
    "contacted",
    "rejected",
  ]);
  assert.equal(volunteerStatusLabel("pending"), "Pendiente");
  assert.equal(volunteerStatusLabel("rejected"), "No procede");
  assert.equal(volunteerStatusLabel("otro"), "otro");
  assert.equal(isVolunteerStatus("approved"), true);
  assert.equal(isVolunteerStatus("aprobado"), false);
});

test("transiciones válidas: cubren el flujo real del panel", () => {
  // Flujo del panel: revisar, aprobar, contactar y descartar.
  assert.equal(canTransition("pending", "reviewing"), true);
  assert.equal(canTransition("pending", "approved"), true);
  assert.equal(canTransition("reviewing", "approved"), true);
  assert.equal(canTransition("approved", "contacted"), true);
  assert.equal(canTransition("contacted", "approved"), true);
  assert.equal(canTransition("pending", "rejected"), true);
  // Reabrir un descarte.
  assert.equal(canTransition("rejected", "pending"), true);
  // Sin saltos absurdos ni no-ops.
  assert.equal(canTransition("pending", "contacted"), false);
  assert.equal(canTransition("approved", "pending"), false);
  assert.equal(canTransition("pending", "pending"), false);
  assert.equal(canTransition("inexistente", "approved"), false);
});

test("transitionError: mensaje accionable con los estados permitidos", () => {
  const message = transitionError("approved", "pending");
  assert.match(message, /Aprobado/);
  assert.match(message, /Pendiente/);
  assert.match(message, /Contactado/);
  assert.match(transitionError("pending", "pending"), /ya está en estado/);
  assert.match(transitionError("x", "y"), /no válido/);
  assert.deepEqual([...allowedTransitions("rejected")], ["pending"]);
  assert.deepEqual([...allowedTransitions("inexistente")], []);
});

test("trazabilidad de la decisión: aprobar y descartar la exigen", () => {
  assert.equal(requiresDecisionTrace("approved"), true);
  assert.equal(requiresDecisionTrace("rejected"), true);
  assert.equal(requiresDecisionTrace("reviewing"), false);
  assert.equal(isDecidedStatus("approved"), true);
  assert.equal(isDecidedStatus("rejected"), true);
  assert.equal(isDecidedStatus("contacted"), false);
});

test("normalizeVolunteerEmail: recorta y baja a minúsculas", () => {
  assert.equal(normalizeVolunteerEmail("  Ana@Ejemplo.COM "), "ana@ejemplo.com");
  assert.equal(normalizeVolunteerEmail(null), "");
  assert.equal(normalizeVolunteerEmail(42), "");
});

test("isValidVolunteerEmail: valida la forma del correo", () => {
  assert.equal(isValidVolunteerEmail("ana@ejemplo.com"), true);
  assert.equal(isValidVolunteerEmail("a@b.co"), true);
  assert.equal(isValidVolunteerEmail("sin-arroba.com"), false);
  assert.equal(isValidVolunteerEmail("@ejemplo.com"), false);
  assert.equal(isValidVolunteerEmail("dos@arrobas@x.com"), false);
  assert.equal(isValidVolunteerEmail("ana@sinpunto"), false);
  assert.equal(isValidVolunteerEmail("ana@.com"), false);
  assert.equal(isValidVolunteerEmail(""), false);
});

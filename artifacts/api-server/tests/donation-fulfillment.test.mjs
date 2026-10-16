// Cumplimiento del aporte (V20 · Fase 6). Contratos puros, sin DB.
//
// La garantía central: el ciclo de vida del aporte (comprometido / recibido /
// verificado) es INDEPENDIENTE del estado contable. Una PROMESA nunca puede contar
// como ingreso ni como producto recibido.
import { test } from "node:test";
import assert from "node:assert/strict";

const {
  FULFILLMENT_STATUSES,
  DEFAULT_FULFILLMENT_STATUS,
  FULFILLED_STATUSES,
  isFulfillmentStatus,
  normalizeFulfillmentStatus,
  isAllowedFulfillmentTransition,
  fulfillmentBlockReason,
  fulfillmentLabel,
  isFulfilledStatus,
  isVerifiedStatus,
  canEditFreely,
} = await import("./dist/lib/donation-fulfillment.mjs");

const { CONFIRMED_DONATION_STATUSES } = await import("./dist/lib/donor-identity.mjs");

test("cumplimiento: estados y valor por defecto", () => {
  assert.deepEqual(
    [...FULFILLMENT_STATUSES],
    ["pendiente_coordinacion", "comprometida", "recibida", "verificada", "rechazada_cancelada"],
  );
  assert.equal(DEFAULT_FULFILLMENT_STATUS, "pendiente_coordinacion");
  assert.equal(isFulfillmentStatus("comprometida"), true);
  assert.equal(isFulfillmentStatus("approved"), false);
  // Un valor desconocido cae al inicio del ciclo (nunca a un estado «recibido»).
  assert.equal(normalizeFulfillmentStatus("cualquiera"), "pendiente_coordinacion");
  assert.equal(normalizeFulfillmentStatus("verificada"), "verificada");
});

test("cumplimiento: transiciones hacia delante y a cancelada", () => {
  assert.equal(isAllowedFulfillmentTransition("pendiente_coordinacion", "comprometida"), true);
  assert.equal(isAllowedFulfillmentTransition("comprometida", "recibida"), true);
  assert.equal(isAllowedFulfillmentTransition("recibida", "verificada"), true);
  // Se puede cancelar desde cualquier estado no verificado.
  assert.equal(isAllowedFulfillmentTransition("pendiente_coordinacion", "rechazada_cancelada"), true);
  assert.equal(isAllowedFulfillmentTransition("comprometida", "rechazada_cancelada"), true);
  assert.equal(isAllowedFulfillmentTransition("recibida", "rechazada_cancelada"), true);
  // Reabrir una cancelada vuelve al inicio.
  assert.equal(isAllowedFulfillmentTransition("rechazada_cancelada", "pendiente_coordinacion"), true);
});

test("cumplimiento: no se salta la verificación ni se deshace", () => {
  assert.equal(isAllowedFulfillmentTransition("pendiente_coordinacion", "verificada"), false);
  assert.equal(isAllowedFulfillmentTransition("comprometida", "verificada"), false);
  assert.equal(isAllowedFulfillmentTransition("pendiente_coordinacion", "recibida"), true);
  // `verificada` es terminal: no se deshace por la vía normal.
  assert.equal(isAllowedFulfillmentTransition("verificada", "recibida"), false);
  assert.equal(isAllowedFulfillmentTransition("verificada", "pendiente_coordinacion"), false);
  assert.equal(isAllowedFulfillmentTransition("verificada", "rechazada_cancelada"), false);
  // Mismo estado: no es transición.
  assert.equal(isAllowedFulfillmentTransition("recibida", "recibida"), false);
  assert.equal(isAllowedFulfillmentTransition("hackeado", "verificada"), false);
});

test("cumplimiento: motivo claro cuando la transición no se permite", () => {
  assert.equal(fulfillmentBlockReason("comprometida", "recibida"), null);
  assert.match(fulfillmentBlockReason("verificada", "recibida"), /corrección auditada/i);
  assert.match(fulfillmentBlockReason("recibida", "recibida"), /ya está/i);
  assert.match(fulfillmentBlockReason("comprometida", "verificada"), /No se puede pasar/i);
  assert.equal(fulfillmentBlockReason("inventado", "recibida"), "Estado de cumplimiento inválido.");
});

test("cumplimiento: una PROMESA no cuenta como recibido (separación de dinero)", () => {
  // Solo «recibida» y «verificada» cuentan como aporte efectivamente recibido.
  assert.deepEqual([...FULFILLED_STATUSES], ["recibida", "verificada"]);
  assert.equal(isFulfilledStatus("pendiente_coordinacion"), false);
  assert.equal(isFulfilledStatus("comprometida"), false);
  assert.equal(isFulfilledStatus("rechazada_cancelada"), false);
  assert.equal(isFulfilledStatus("recibida"), true);
  assert.equal(isFulfilledStatus("verificada"), true);
  // Lo único publicable en la galería es lo verificado.
  assert.equal(isVerifiedStatus("recibida"), false);
  assert.equal(isVerifiedStatus("verificada"), true);
});

test("cumplimiento: no se toca el estado CONTABLE (el libro sigue intacto)", () => {
  // Guarda de regresión: si alguien metiera «recibida»/«verificada» en los estados
  // confirmados, una promesa contaría como ingreso y cambiarían todas las cifras.
  assert.deepEqual([...CONFIRMED_DONATION_STATUSES], ["approved", "reconciled"]);
  for (const status of FULFILLMENT_STATUSES) {
    assert.equal(
      CONFIRMED_DONATION_STATUSES.includes(status),
      false,
      `${status} NO debe ser un estado contable confirmado`,
    );
  }
});

test("cumplimiento: etiquetas y edición libre", () => {
  assert.equal(fulfillmentLabel("pendiente_coordinacion"), "Pendiente de coordinación");
  assert.equal(fulfillmentLabel("verificada"), "Verificada");
  assert.equal(fulfillmentLabel("otro"), "otro");
  assert.equal(canEditFreely("pendiente_coordinacion"), true);
  assert.equal(canEditFreely("comprometida"), false);
  assert.equal(canEditFreely("verificada"), false);
});

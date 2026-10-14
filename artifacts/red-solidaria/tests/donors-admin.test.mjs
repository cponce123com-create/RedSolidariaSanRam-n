// Presentación y totales del panel de donantes (funciones puras, sin red).
import { test } from "node:test";
import assert from "node:assert/strict";

const {
  COLLABORATION_TYPES,
  DEFAULT_COLLABORATION_TYPE,
  DONOR_TYPES,
  collaborationTypeLabel,
  donationStatusBadge,
  donationStatusLabel,
  donorTypeLabel,
  isCollaborationType,
  isMoneyCollaboration,
  normalizeCollaborationType,
  summarizeDonations,
} = await import("./dist/donors-admin.mjs");

test("tipos de donante: etiquetas y respaldo", () => {
  assert.deepEqual(DONOR_TYPES, [
    "individual",
    "familia",
    "empresa",
    "organizacion",
    "anonimo",
  ]);
  assert.equal(donorTypeLabel("individual"), "Persona");
  assert.equal(donorTypeLabel("familia"), "Familia");
  assert.equal(donorTypeLabel("empresa"), "Empresa");
  assert.equal(donorTypeLabel("organizacion"), "Organización");
  assert.equal(donorTypeLabel("anonimo"), "Anónimo");
  assert.equal(donorTypeLabel("desconocido"), "desconocido");
});

test("tipos de colaboración: lista canónica y etiquetas", () => {
  assert.deepEqual(COLLABORATION_TYPES, ["dinero", "productos", "servicios", "logistica"]);
  assert.equal(DEFAULT_COLLABORATION_TYPE, "dinero");
  for (const t of COLLABORATION_TYPES) assert.equal(isCollaborationType(t), true);
  assert.equal(isCollaborationType("trueque"), false);
  assert.equal(isCollaborationType(undefined), false);
  assert.equal(collaborationTypeLabel("dinero"), "Dinero");
  assert.equal(collaborationTypeLabel("productos"), "Productos");
  assert.equal(collaborationTypeLabel("servicios"), "Servicios");
  assert.equal(collaborationTypeLabel("logistica"), "Apoyo logístico");
  assert.equal(collaborationTypeLabel("otro"), "otro");
});

test("normalizeCollaborationType: lo desconocido es dinero (nunca al revés)", () => {
  assert.equal(normalizeCollaborationType("productos"), "productos");
  assert.equal(normalizeCollaborationType("trueque"), "dinero");
  assert.equal(normalizeCollaborationType(undefined), "dinero");
  assert.equal(normalizeCollaborationType(null), "dinero");
  assert.equal(normalizeCollaborationType(42), "dinero");
});

test("isMoneyCollaboration: solo dinero exige monto y método de pago", () => {
  assert.equal(isMoneyCollaboration("dinero"), true);
  assert.equal(isMoneyCollaboration("productos"), false);
  assert.equal(isMoneyCollaboration("servicios"), false);
  assert.equal(isMoneyCollaboration("logistica"), false);
  // Filas antiguas sin el campo (datos cacheados) se tratan como dinero.
  assert.equal(isMoneyCollaboration(undefined), true);
  assert.equal(isMoneyCollaboration(null), true);
});

test("estados de donación: incluye 'reconciled'", () => {
  assert.equal(donationStatusLabel("pending"), "Pendiente");
  assert.equal(donationStatusLabel("approved"), "Aprobada");
  assert.equal(donationStatusLabel("rejected"), "Rechazada");
  assert.equal(donationStatusLabel("reconciled"), "Conciliada");
  assert.equal(donationStatusLabel("otro"), "otro");
  assert.match(donationStatusBadge("reconciled"), /emerald/);
  assert.match(donationStatusBadge("desconocido"), /secondary/);
});

test("summarizeDonations: cuenta todo y suma solo lo confirmado", () => {
  const totals = summarizeDonations([
    { status: "approved", amount: 100 },
    { status: "reconciled", amount: 50.5 },
    { status: "pending", amount: 999 },
    { status: "rejected", amount: 999 },
  ]);
  assert.equal(totals.count, 4);
  assert.equal(totals.confirmedTotal, 150.5);
});

test("summarizeDonations: tolera listas ausentes o vacías", () => {
  assert.deepEqual(summarizeDonations(undefined), { count: 0, confirmedTotal: 0 });
  assert.deepEqual(summarizeDonations(null), { count: 0, confirmedTotal: 0 });
  assert.deepEqual(summarizeDonations([]), { count: 0, confirmedTotal: 0 });
});

test("summarizeDonations: ignora montos no numéricos", () => {
  const totals = summarizeDonations([
    { status: "approved", amount: Number.NaN },
    { status: "approved", amount: 20 },
  ]);
  assert.equal(totals.count, 2);
  assert.equal(totals.confirmedTotal, 20);
});

// Presentación y totales del panel de donantes (funciones puras, sin red).
import { test } from "node:test";
import assert from "node:assert/strict";

const {
  DONOR_TYPES,
  donationStatusBadge,
  donationStatusLabel,
  donorTypeLabel,
  summarizeDonations,
} = await import("./dist/donors-admin.mjs");

test("tipos de donante: etiquetas y respaldo", () => {
  assert.deepEqual(DONOR_TYPES, ["individual", "familia", "empresa", "anonimo"]);
  assert.equal(donorTypeLabel("individual"), "Persona");
  assert.equal(donorTypeLabel("familia"), "Familia");
  assert.equal(donorTypeLabel("empresa"), "Empresa");
  assert.equal(donorTypeLabel("anonimo"), "Anónimo");
  assert.equal(donorTypeLabel("desconocido"), "desconocido");
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

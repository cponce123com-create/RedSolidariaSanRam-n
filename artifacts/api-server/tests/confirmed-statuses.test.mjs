// Estados que cuentan como dinero confirmado (regresión de la conciliación).
import { test } from "node:test";
import assert from "node:assert/strict";

const { CONFIRMED_DONATION_STATUSES, isConfirmedDonationStatus } = await import(
  "./dist/lib/donor-identity.mjs"
);

test("dinero confirmado: incluye 'approved' y 'reconciled'", () => {
  assert.deepEqual([...CONFIRMED_DONATION_STATUSES], ["approved", "reconciled"]);
  assert.equal(isConfirmedDonationStatus("approved"), true);
  // `reconciled` es una evolución de `approved`: si no contara, el total
  // BAJARÍA al conciliar una donación.
  assert.equal(isConfirmedDonationStatus("reconciled"), true);
});

test("dinero confirmado: excluye pendientes y rechazadas", () => {
  assert.equal(isConfirmedDonationStatus("pending"), false);
  assert.equal(isConfirmedDonationStatus("rejected"), false);
  assert.equal(isConfirmedDonationStatus("cualquiera"), false);
  assert.equal(isConfirmedDonationStatus(""), false);
});

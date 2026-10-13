// Reconciliación idempotente de donaciones sembradas (IMP-01/IMP-04).
// Funciones puras, sin DB: se ejecutan contra el bundle de tests.
import { test } from "node:test";
import assert from "node:assert/strict";

const { donationKey, planDonationInsert } = await import(
  "./dist/lib/donation-reconcile.mjs"
);

const base = {
  firstName: "M",
  lastName: "",
  amount: 100,
  paymentMethod: "cash",
  message: null,
  createdAt: new Date("2025-12-04T12:00:00.000Z"),
};

test("donationKey: estable ante number/string y Date/ISO string", () => {
  assert.equal(donationKey(base), donationKey({ ...base, amount: "100.00" }));
  assert.equal(
    donationKey(base),
    donationKey({ ...base, amount: 100.0, createdAt: "2025-12-04T12:00:00.000Z" }),
  );
  // El trim de nombres no debe crear claves distintas
  assert.equal(donationKey(base), donationKey({ ...base, firstName: "  M  " }));
});

test("donationKey: distingue donaciones diferentes", () => {
  assert.notEqual(donationKey(base), donationKey({ ...base, amount: 120 }));
  assert.notEqual(donationKey(base), donationKey({ ...base, paymentMethod: "other" }));
  assert.notEqual(donationKey(base), donationKey({ ...base, firstName: "Jenny" }));
  assert.notEqual(donationKey(base), donationKey({ ...base, message: "x" }));
});

test("plan: BD vacía → inserta todo (nada se omite)", () => {
  const seed = [base, { ...base, firstName: "Jenny" }];
  const { toInsert, alreadyPresent } = planDonationInsert(seed, []);
  assert.equal(toInsert.length, 2);
  assert.equal(alreadyPresent, 0);
});

test("plan: re-ejecución con todo presente → no inserta nada (idempotente)", () => {
  const seed = [base, { ...base, firstName: "Jenny" }];
  const existing = [base, { ...base, firstName: "Jenny" }];
  const { toInsert, alreadyPresent } = planDonationInsert(seed, existing);
  assert.equal(toInsert.length, 0);
  assert.equal(alreadyPresent, 2);
});

test("plan: BD parcial → inserta solo las que faltan", () => {
  const seed = [base, { ...base, firstName: "Jenny" }, { ...base, firstName: "Carlos" }];
  const existing = [base];
  const { toInsert, alreadyPresent } = planDonationInsert(seed, existing);
  assert.equal(alreadyPresent, 1);
  assert.deepEqual(
    toInsert.map((d) => d.firstName),
    ["Jenny", "Carlos"],
  );
});

test("plan: no borra ni reemplaza donaciones reales (solo agrega)", () => {
  const seed = [base];
  // Una donación real creada por la API (no está en la hoja): debe permanecer.
  const real = {
    firstName: "Donante Real",
    lastName: "Pérez",
    amount: 250.5,
    paymentMethod: "yape",
    message: "gracias",
    createdAt: new Date("2026-01-02T09:00:00.000Z"),
  };
  const { toInsert } = planDonationInsert(seed, [real]);
  assert.equal(toInsert.length, 1);
  assert.equal(toInsert[0].firstName, "M");
});

test("plan: multiconjunto — dos idénticas en la fuente, una en BD → inserta una", () => {
  const seed = [base, { ...base }]; // dos entradas idénticas
  const existing = [base]; // una ya presente
  const { toInsert, alreadyPresent } = planDonationInsert(seed, existing);
  assert.equal(alreadyPresent, 1);
  assert.equal(toInsert.length, 1);
});

test("plan: la misma donación en otra campaña no colisiona (scope por campaña)", () => {
  // El llamador filtra por campaignId; aquí se documenta que la clave no
  // incluye campaña, por lo que el diff debe hacerse con las filas de ESA campaña.
  const seed = [base];
  const { toInsert } = planDonationInsert(seed, []);
  assert.equal(toInsert.length, 1);
});

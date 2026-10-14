// Identidad de donante, duplicados y conciliación (funciones puras, sin DB).
import { test } from "node:test";
import assert from "node:assert/strict";

const {
  DONOR_TYPES,
  DONATION_STATUSES,
  canReconcile,
  donationDedupKey,
  donorTypeLabel,
  findDuplicateGroups,
  isDonationStatus,
  isDonorType,
  normalizeEmail,
  reconcileBlockReason,
} = await import("./dist/lib/donor-identity.mjs");

test("tipos de donante: se reconocen los cuatro del modelo", () => {
  assert.deepEqual([...DONOR_TYPES], ["individual", "familia", "empresa", "anonimo"]);
  for (const t of DONOR_TYPES) assert.equal(isDonorType(t), true);
  assert.equal(isDonorType("ong"), false);
  assert.equal(isDonorType(null), false);
  assert.equal(donorTypeLabel("familia"), "Familia");
  assert.equal(donorTypeLabel("otro"), "otro");
});

test("normalizeEmail: recorta espacios y baja a minúsculas", () => {
  assert.equal(normalizeEmail("  Juan@Example.COM "), "juan@example.com");
  assert.equal(normalizeEmail(null), "");
  assert.equal(normalizeEmail(undefined), "");
  assert.equal(normalizeEmail(42), "");
});

test("estados de donación: incluye 'reconciled' sin migración", () => {
  assert.deepEqual([...DONATION_STATUSES], ["pending", "approved", "rejected", "reconciled"]);
  assert.equal(isDonationStatus("reconciled"), true);
  assert.equal(isDonationStatus("conciliada"), false);
});

test("conciliación: solo sobre donaciones aprobadas", () => {
  assert.equal(canReconcile("approved"), true);
  assert.equal(canReconcile("pending"), false);
  assert.equal(canReconcile("reconciled"), false);
  assert.equal(reconcileBlockReason("approved"), null);
  assert.match(reconcileBlockReason("pending"), /aprobadas/);
  assert.match(reconcileBlockReason("rejected"), /aprobadas/);
  assert.match(reconcileBlockReason("reconciled"), /ya está conciliada/);
});

test("donationDedupKey: correo normalizado + monto + día (Date o ISO)", () => {
  const a = donationDedupKey({
    email: "Ana@Mail.com",
    amount: 50,
    createdAt: new Date("2026-03-04T10:00:00Z"),
  });
  const b = donationDedupKey({
    email: "ana@mail.com",
    amount: "50.00",
    createdAt: "2026-03-04T23:59:00.000Z",
  });
  assert.equal(a, b);
  assert.equal(a, "ana@mail.com|50.00|2026-03-04");
});

test("donationDedupKey: distingue monto o día distintos", () => {
  const base = { email: "a@b.com", amount: 50, createdAt: "2026-03-04T10:00:00Z" };
  assert.notEqual(
    donationDedupKey(base),
    donationDedupKey({ ...base, amount: 51 }),
  );
  assert.notEqual(
    donationDedupKey(base),
    donationDedupKey({ ...base, createdAt: "2026-03-05T10:00:00Z" }),
  );
});

test("findDuplicateGroups: agrupa repetidos y los ordena por tamaño", () => {
  const rows = [
    { id: 1, email: "a@b.com", amount: 50, createdAt: "2026-03-04T09:00:00Z" },
    { id: 2, email: "A@B.com", amount: 50, createdAt: "2026-03-04T18:00:00Z" },
    { id: 3, email: "c@d.com", amount: 20, createdAt: "2026-03-04T09:00:00Z" },
    { id: 4, email: "c@d.com", amount: 20, createdAt: "2026-03-04T09:30:00Z" },
    { id: 5, email: "c@d.com", amount: 20, createdAt: "2026-03-04T09:45:00Z" },
    { id: 6, email: "e@f.com", amount: 20, createdAt: "2026-03-04T09:00:00Z" },
  ];
  const groups = findDuplicateGroups(rows);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].length, 3);
  assert.equal(groups[1].length, 2);
  assert.deepEqual(groups[0].map((d) => d.id), [3, 4, 5]);
});

test("findDuplicateGroups: ignora donaciones sin correo (evita falsos positivos)", () => {
  const groups = findDuplicateGroups([
    { id: 1, email: null, amount: 50, createdAt: "2026-03-04T09:00:00Z" },
    { id: 2, email: "", amount: 50, createdAt: "2026-03-04T09:00:00Z" },
    { id: 3, email: "   ", amount: 50, createdAt: "2026-03-04T09:00:00Z" },
  ]);
  assert.deepEqual(groups, []);
});

test("findDuplicateGroups: sin duplicados devuelve lista vacía", () => {
  assert.deepEqual(findDuplicateGroups([]), []);
  assert.deepEqual(
    findDuplicateGroups([
      { id: 1, email: "a@b.com", amount: 10, createdAt: "2026-03-04T09:00:00Z" },
    ]),
    [],
  );
});

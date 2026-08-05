import { test } from "node:test";
import assert from "node:assert/strict";
import { formatPublicDonor } from "./dist/lib/donor-format.mjs";

const base = {
  id: 1,
  firstName: "María",
  lastName: "Gómez",
  amount: 50,
  message: null,
  anonymous: false,
  publicProof: false,
  receiptUrl: null,
  createdAt: new Date("2026-08-05T10:00:00Z"),
};

test("donor: muestra nombre completo si no es anónimo", () => {
  const donor = formatPublicDonor({ ...base });
  assert.equal(donor.name, "María Gómez");
});

test("donor: oculta el nombre si la donación es anónima", () => {
  const donor = formatPublicDonor({ ...base, anonymous: true });
  assert.equal(donor.name, null);
});

test("donor: oculta el comprobante si publicProof es false", () => {
  const donor = formatPublicDonor({ ...base, receiptUrl: "https://img.example/1.png" });
  assert.equal(donor.proofUrl, null);
  assert.equal(donor.publicProof, false);
});

test("donor: expone el comprobante solo si publicProof es true", () => {
  const donor = formatPublicDonor({
    ...base,
    publicProof: true,
    receiptUrl: "https://img.example/1.png",
  });
  assert.equal(donor.proofUrl, "https://img.example/1.png");
  assert.equal(donor.publicProof, true);
});

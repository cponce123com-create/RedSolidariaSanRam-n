import { test } from "node:test";
import assert from "node:assert/strict";
import { adoptionPetStatus as resolve } from "./dist/lib/adoption-state.mjs";
test("reversing a decision restores availability", () => {
  assert.equal(resolve("adopted", "approved", "rejected", []), "available");
  assert.equal(resolve("in-process", "in-process", "pending", []), "available");
});
test("another active decision and manual withdrawal are preserved", () => {
  assert.equal(resolve("adopted", "pending", "rejected", ["approved"]), "adopted");
  assert.equal(resolve("in-process", "pending", "rejected", ["in-process"]), "in-process");
  assert.equal(resolve("inactive", "approved", "rejected", []), "inactive");
  assert.equal(resolve("reviewing", "pending", "rejected", []), "reviewing");
});
test("new decisions set the corresponding publication state", () => {
  assert.equal(resolve("available", "pending", "approved", []), "adopted");
  assert.equal(resolve("available", "pending", "in-process", []), "in-process");
});

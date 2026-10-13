import { test } from "node:test";
import assert from "node:assert/strict";

const { hasPgErrorCode, isForeignKeyViolation } = await import(
  "./dist/lib/pg-errors.mjs"
);

test("hasPgErrorCode: detecta el SQLSTATE en un objeto de error", () => {
  assert.equal(hasPgErrorCode({ code: "23503" }, "23503"), true);
  assert.equal(hasPgErrorCode({ code: "23505" }, "23503"), false);
});

test("hasPgErrorCode: tolera valores que no son objetos", () => {
  for (const value of [null, undefined, "23503", 42, true]) {
    assert.equal(hasPgErrorCode(value, "23503"), false);
  }
});

test("hasPgErrorCode: un objeto sin code no coincide", () => {
  assert.equal(hasPgErrorCode({}, "23503"), false);
  assert.equal(hasPgErrorCode(new Error("boom"), "23503"), false);
});

test("isForeignKeyViolation: solo 23503", () => {
  assert.equal(isForeignKeyViolation({ code: "23503" }), true);
  assert.equal(isForeignKeyViolation({ code: "23505" }), false);
  assert.equal(isForeignKeyViolation(null), false);
  assert.equal(isForeignKeyViolation(undefined), false);
  assert.equal(isForeignKeyViolation(new Error("Failed to delete campaign")), false);
});

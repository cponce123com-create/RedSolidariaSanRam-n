import { test } from "node:test";
import assert from "node:assert/strict";

// El módulo captura el env al cargar; sin credenciales el upload queda deshabilitado
test("cloudinary: sin credenciales devuelve null y no está configurado", async () => {
  delete process.env.CLOUDINARY_CLOUD_NAME;
  delete process.env.CLOUDINARY_API_KEY;
  delete process.env.CLOUDINARY_API_SECRET;
  const mod = await import("./dist/lib/cloudinary.mjs?no-creds=" + Date.now());
  assert.equal(mod.isCloudinaryConfigured(), false);
  assert.equal(mod.getUploadSignature("donation-proofs"), null);
});

test("cloudinary: con credenciales genera firma sha1 de 40 hex", async () => {
  process.env.CLOUDINARY_CLOUD_NAME = "test-cloud";
  process.env.CLOUDINARY_API_KEY = "key123";
  process.env.CLOUDINARY_API_SECRET = "secret123";
  const mod = await import("./dist/lib/cloudinary.mjs?creds=" + Date.now());
  const sig = mod.getUploadSignature("donation-proofs");
  assert.ok(sig, "debe devolver una firma");
  assert.equal(sig.cloudName, "test-cloud");
  assert.equal(sig.folder, "donation-proofs");
  assert.match(sig.signature, /^[0-9a-f]{40}$/);
});

test("cloudinary: la firma es determinista y sensible al secreto", async () => {
  const mod = await import("./dist/lib/cloudinary.mjs?det=" + Date.now());
  const params = { folder: "x", public_id: "y", timestamp: "123" };
  const a = mod.createUploadSignature(params, "secret-a");
  const b = mod.createUploadSignature(params, "secret-a");
  const c = mod.createUploadSignature(params, "secret-b");
  assert.equal(a, b);
  assert.notEqual(a, c);
});

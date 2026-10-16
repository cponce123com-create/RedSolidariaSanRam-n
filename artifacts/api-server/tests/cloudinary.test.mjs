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

test("cloudinary: firma la restricción de formato y SOLO parámetros reconocidos", async () => {
  process.env.CLOUDINARY_CLOUD_NAME = "test-cloud";
  process.env.CLOUDINARY_API_KEY = "key123";
  process.env.CLOUDINARY_API_SECRET = "secret123";
  const mod = await import("./dist/lib/cloudinary.mjs?restric=" + Date.now());
  const sig = mod.getUploadSignature("donation-proofs");
  assert.equal(sig.allowedFormats, "jpg,png,webp");

  // `max_bytes` NO se firma ni se devuelve: no es un parámetro de la API de subida de
  // Cloudinary y, al no coincidir con lo que Cloudinary recalcula, provocaba
  // 401 «Invalid Signature» (regresión V18.1).
  assert.equal("maxBytes" in sig, false);

  const base = { folder: sig.folder, public_id: sig.publicId, timestamp: sig.timestamp };
  const signed = mod.createUploadSignature(
    { ...base, allowed_formats: sig.allowedFormats },
    "secret123",
  );
  assert.equal(signed, sig.signature);

  // Alterar la restricción invalida la firma.
  const tampered = mod.createUploadSignature({ ...base, allowed_formats: "gif" }, "secret123");
  assert.notEqual(tampered, sig.signature);

  // Enviar un parámetro EXTRA que no se firmó también la invalida: el cliente debe
  // mandar exactamente lo que se firmó.
  const extra = mod.createUploadSignature(
    { ...base, allowed_formats: sig.allowedFormats, max_bytes: "1" },
    "secret123",
  );
  assert.notEqual(extra, sig.signature);
});

test("cloudinary: tolera espacios o saltos de línea en las credenciales (trim)", async () => {
  process.env.CLOUDINARY_CLOUD_NAME = "test-cloud\n";
  process.env.CLOUDINARY_API_KEY = " key123 ";
  process.env.CLOUDINARY_API_SECRET = "secret123\n";
  const mod = await import("./dist/lib/cloudinary.mjs?trim=" + Date.now());
  const sig = mod.getUploadSignature("donation-proofs");
  assert.ok(sig, "debe devolver una firma");
  assert.equal(sig.cloudName, "test-cloud");
  assert.equal(sig.apiKey, "key123");
  // La firma se calcula con el secreto YA recortado.
  const expected = mod.createUploadSignature(
    {
      folder: sig.folder,
      public_id: sig.publicId,
      timestamp: sig.timestamp,
      allowed_formats: sig.allowedFormats,
    },
    "secret123",
  );
  assert.equal(sig.signature, expected);
});

test("cloudinary: la respuesta de firma NO expone el api_secret", async () => {
  process.env.CLOUDINARY_CLOUD_NAME = "test-cloud";
  process.env.CLOUDINARY_API_KEY = "key123";
  process.env.CLOUDINARY_API_SECRET = "secret123";
  const mod = await import("./dist/lib/cloudinary.mjs?nosecret=" + Date.now());
  const sig = mod.getUploadSignature("institutional-identity");
  assert.ok(sig, "debe devolver una firma");
  // El secreto solo se usa para FIRMAR en el servidor: nunca viaja al navegador.
  assert.ok(!("apiSecret" in sig), "la respuesta no debe incluir apiSecret");
  assert.ok(!JSON.stringify(sig).includes("secret123"), "el api_secret no debe aparecer en la respuesta");
  // El cloud name y el api_key sí se devuelven (Cloudinary los exige en el formulario).
  assert.equal(sig.cloudName, "test-cloud");
  assert.equal(sig.apiKey, "key123");
  assert.equal(sig.folder, "institutional-identity");
});

// Mensajes de error de la subida de imágenes (V17).
//
// Regresión cubierta: cuando la CSP bloqueaba api.cloudinary.com, `fetch` rechazaba
// la promesa y el administrador veía «Failed to fetch». Ahora se explica la causa.
import { test } from "node:test";
import assert from "node:assert/strict";

const { describeUploadFailure } = await import("./dist/upload-error-message.mjs");

test("bloqueo de red/CSP → mensaje accionable (nunca 'Failed to fetch')", () => {
  const f = describeUploadFailure({ networkError: true });
  assert.equal(f.kind, "network");
  assert.match(f.message, /conexión/i);
  assert.doesNotMatch(f.message, /Failed to fetch/i);
});

test("Cloudinary rechaza el formato → format", () => {
  const f = describeUploadFailure({ status: 400, cloudinaryMessage: "Invalid image file" });
  assert.equal(f.kind, "format");
  assert.match(f.message, /JPG, PNG o WebP/);
});

test("Cloudinary rechaza por tamaño → size", () => {
  const f = describeUploadFailure({
    status: 400,
    cloudinaryMessage: "File size too large. Got 12 MB. Maximum is 8 MB.",
  });
  assert.equal(f.kind, "size");
  assert.match(f.message, /8 MB/);
});

test("403 al pedir la firma → signature (usa el mensaje del servidor)", () => {
  const f = describeUploadFailure({ status: 403, serverMessage: "No tienes permisos para esta acción" });
  assert.equal(f.kind, "signature");
  assert.equal(f.message, "No tienes permisos para esta acción");
});

test("503 del servicio → server", () => {
  const f = describeUploadFailure({ status: 503 });
  assert.equal(f.kind, "server");
  assert.match(f.message, /no está disponible/i);
});

test("un mensaje desconocido de Cloudinary se conserva en el texto", () => {
  const f = describeUploadFailure({ status: 400, cloudinaryMessage: "Something odd happened" });
  assert.equal(f.kind, "unknown");
  assert.match(f.message, /Something odd happened/);
});

test("sin datos → mensaje genérico reintentable", () => {
  const f = describeUploadFailure({});
  assert.equal(f.kind, "unknown");
  assert.match(f.message, /Inténtalo de nuevo/);
});

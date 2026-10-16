// Validación de imágenes en el navegador (V18): formato, peso y DIMENSIONES.
//
// Regresión cubierta: antes solo se miraban el tipo MIME y el peso, así que se podía
// subir un favicon RECTANGULAR o un logotipo de 8×8 px sin ningún aviso.
import { test } from "node:test";
import assert from "node:assert/strict";

const { describeImageValidation, FAVICON_ALLOWED_IMAGE_TYPES, DEFAULT_MAX_IMAGE_BYTES } =
  await import("./dist/image-validation.mjs");

test("acepta una imagen correcta", () => {
  const r = describeImageValidation({ type: "image/png", size: 1024, width: 512, height: 512 });
  assert.equal(r.ok, true);
  assert.equal(r.code, null);
});

test("rechaza un formato no permitido con mensaje claro", () => {
  const r = describeImageValidation({ type: "image/gif", size: 1024 });
  assert.equal(r.ok, false);
  assert.equal(r.code, "type");
  assert.match(r.message, /JPG, PNG, WebP/);
});

test("rechaza por peso indicando los MB", () => {
  const r = describeImageValidation({ type: "image/jpeg", size: DEFAULT_MAX_IMAGE_BYTES + 1 });
  assert.equal(r.ok, false);
  assert.equal(r.code, "size");
  assert.match(r.message, /8\.0 MB/);
});

test("favicon: exige CUADRADO y solo PNG/WebP", () => {
  const rectangular = describeImageValidation({
    type: "image/png",
    size: 1024,
    width: 64,
    height: 32,
    requireSquare: true,
    allowedTypes: FAVICON_ALLOWED_IMAGE_TYPES,
  });
  assert.equal(rectangular.code, "square");
  assert.match(rectangular.message, /CUADRADA/);

  const jpg = describeImageValidation({
    type: "image/jpeg",
    size: 1024,
    width: 64,
    height: 64,
    requireSquare: true,
    allowedTypes: FAVICON_ALLOWED_IMAGE_TYPES,
  });
  assert.equal(jpg.code, "type");

  const ok = describeImageValidation({
    type: "image/webp",
    size: 1024,
    width: 64,
    height: 64,
    requireSquare: true,
    allowedTypes: FAVICON_ALLOWED_IMAGE_TYPES,
  });
  assert.equal(ok.ok, true);
});

test("aplica lado mínimo y máximo", () => {
  const small = describeImageValidation({ type: "image/png", size: 10, width: 8, height: 8, minSide: 32 });
  assert.equal(small.code, "too_small");
  const large = describeImageValidation({ type: "image/png", size: 10, width: 9000, height: 100, maxSide: 4096 });
  assert.equal(large.code, "too_large");
});

test("sin dimensiones legibles no se inventan errores", () => {
  const r = describeImageValidation({
    type: "image/png",
    size: 10,
    width: null,
    height: null,
    requireSquare: true,
  });
  assert.equal(r.ok, true);
});

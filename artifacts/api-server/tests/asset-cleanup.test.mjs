import { test } from "node:test";
import assert from "node:assert/strict";

// Módulo puro (sin red): la extracción del public_id se prueba directamente.
const { extractCloudinaryPublicId, cleanupCloudinaryAssets } = await import(
  "./dist/lib/asset-cleanup.mjs"
);

test("extractCloudinaryPublicId: URL con versión y carpeta", () => {
  assert.equal(
    extractCloudinaryPublicId("https://res.cloudinary.com/demo/image/upload/v1712345678/campaigns/foto.jpg"),
    "campaigns/foto",
  );
});

test("extractCloudinaryPublicId: URL sin versión", () => {
  assert.equal(
    extractCloudinaryPublicId("https://res.cloudinary.com/demo/image/upload/campaigns/foto.png"),
    "campaigns/foto",
  );
});

test("extractCloudinaryPublicId: URL con transformaciones", () => {
  assert.equal(
    extractCloudinaryPublicId(
      "https://res.cloudinary.com/demo/image/upload/w_500,h_300,c_fill/v1712345678/campaigns/foto.webp",
    ),
    "campaigns/foto",
  );
});

test("extractCloudinaryPublicId: activo en la raíz", () => {
  assert.equal(
    extractCloudinaryPublicId("https://res.cloudinary.com/demo/image/upload/sample"),
    "sample",
  );
  assert.equal(
    extractCloudinaryPublicId("https://res.cloudinary.com/demo/image/upload/v1/sample.jpg"),
    "sample",
  );
});

test("extractCloudinaryPublicId: entradas no válidas → null", () => {
  assert.equal(extractCloudinaryPublicId("https://example.com/foto.jpg"), null);
  assert.equal(extractCloudinaryPublicId("not-a-url"), null);
  assert.equal(extractCloudinaryPublicId(""), null);
  assert.equal(extractCloudinaryPublicId(null), null);
  assert.equal(extractCloudinaryPublicId(42), null);
  // URL de Cloudinary sin segmento `upload` (p. ej. `fetch`).
  assert.equal(extractCloudinaryPublicId("https://res.cloudinary.com/demo/image/fetch/abc"), null);
});

test("cleanupCloudinaryAssets: sin credenciales no intenta red y no falla", async () => {
  const saved = {
    name: process.env.CLOUDINARY_CLOUD_NAME,
    key: process.env.CLOUDINARY_API_KEY,
    secret: process.env.CLOUDINARY_API_SECRET,
  };
  delete process.env.CLOUDINARY_CLOUD_NAME;
  delete process.env.CLOUDINARY_API_KEY;
  delete process.env.CLOUDINARY_API_SECRET;

  try {
    const warnings = [];
    const result = await cleanupCloudinaryAssets(
      [
        "https://res.cloudinary.com/demo/image/upload/campaigns/a.jpg",
        "https://res.cloudinary.com/demo/image/upload/campaigns/a.jpg", // duplicado
        "https://example.com/not-cloudinary.jpg",
      ],
      { warn: (...args) => warnings.push(args) },
    );
    // 1 public_id único, 0 intentos de red: las 3 URLs quedan sin limpiar
    // (2 no-cloudinary + 1 cloudinary sin credenciales configuradas).
    assert.equal(result.attempted, 0);
    assert.equal(result.deleted, 0);
    assert.equal(result.failed.length, 0);
    assert.equal(result.skipped, 3);
    assert.equal(warnings.length, 0);
  } finally {
    if (saved.name) process.env.CLOUDINARY_CLOUD_NAME = saved.name;
    if (saved.key) process.env.CLOUDINARY_API_KEY = saved.key;
    if (saved.secret) process.env.CLOUDINARY_API_SECRET = saved.secret;
  }
});

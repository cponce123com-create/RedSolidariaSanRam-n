// Resultados y rendición final (funciones puras, sin red).
import { test } from "node:test";
import assert from "node:assert/strict";

const { isVideoEvidence, summarizeEvidence } = await import("./dist/results.mjs");

test("isVideoEvidence: reconoce 'video' sin distinguir mayúsculas ni espacios", () => {
  assert.equal(isVideoEvidence({ mediaType: "video" }), true);
  assert.equal(isVideoEvidence({ mediaType: " Video " }), true);
  assert.equal(isVideoEvidence({ mediaType: "image" }), false);
  assert.equal(isVideoEvidence({ mediaType: null }), false);
  assert.equal(isVideoEvidence({}), false);
});

test("summarizeEvidence: cuenta total, imágenes y videos", () => {
  const s = summarizeEvidence([
    { id: 1, mediaUrl: "a.jpg", mediaType: "image" },
    { id: 2, mediaUrl: "b.mp4", mediaType: "video" },
    { id: 3, mediaUrl: "c.jpg", mediaType: "image" },
  ]);
  assert.deepEqual(s, { total: 3, images: 2, videos: 1 });
});

test("summarizeEvidence: tolera listas ausentes o vacías", () => {
  assert.deepEqual(summarizeEvidence(undefined), { total: 0, images: 0, videos: 0 });
  assert.deepEqual(summarizeEvidence(null), { total: 0, images: 0, videos: 0 });
  assert.deepEqual(summarizeEvidence([]), { total: 0, images: 0, videos: 0 });
});

test("summarizeEvidence: un mediaType desconocido cuenta como imagen", () => {
  const s = summarizeEvidence([{ id: 1, mediaUrl: "x", mediaType: "gif" }]);
  assert.deepEqual(s, { total: 1, images: 1, videos: 0 });
});

// Lógica pura de la identidad institucional (Fase 3): normalización, validación,
// DTO público con allowlist explícita y guardas de seguridad de assets.
import { test } from "node:test";
import assert from "node:assert/strict";

const {
  normalizeContent,
  validateContent,
  isContentEmpty,
  publicIdentityDto,
  isOwnedPublicId,
  isSafeImageUrl,
  isSafeLinkUrl,
  emptyContent,
} = await import("./dist/lib/institutional-identity.mjs");

test("normalizeContent: recorta y completa la estructura", () => {
  const c = normalizeContent({ hero: { title: "  Historia  " }, values: [{ title: "A" }] });
  assert.equal(c.hero.title, "Historia");
  assert.deepEqual(c.values, [{ title: "A", description: "" }]);
  assert.equal(c.cover.focus, "50% 50%");
});

test("normalizeContent: solo acepta URLs https de imagen", () => {
  const c = normalizeContent({
    logo: { url: "javascript:alert(1)" },
    story: { photos: ["http://insegura", "https://res.cloudinary.com/x/y.jpg"] },
  });
  assert.equal(c.logo.url, "");
  assert.deepEqual(c.story.photos, ["https://res.cloudinary.com/x/y.jpg"]);
});

test("normalizeContent: sanea el HTML de la historia (anti-XSS)", () => {
  const c = normalizeContent({ story: { html: "<p>ok</p><script>alert(1)</script>" } });
  assert.equal(c.story.html, "<p>ok</p>");
});

test("normalizeContent + validateContent: CTA con enlace peligroso queda inválido", () => {
  const c = normalizeContent({ hero: { ctaLabel: "Donar", ctaHref: "javascript:alert(1)" } });
  assert.equal(c.hero.ctaHref, "");
  assert.ok(validateContent(c).length > 0);
});

test("validateContent: el CTA necesita texto y enlace juntos", () => {
  assert.equal(validateContent(emptyContent()).length, 0);
  const soloEtiqueta = { ...emptyContent(), hero: { title: "", subtitle: "", ctaLabel: "Donar", ctaHref: "" } };
  assert.ok(validateContent(soloEtiqueta).length > 0);
});

test("isContentEmpty: distingue vacío de con contenido", () => {
  assert.equal(isContentEmpty(emptyContent()), true);
  assert.equal(isContentEmpty({ ...emptyContent(), mission: "Misión" }), false);
});

test("publicIdentityDto: null sin publicar y NUNCA expone publicId", () => {
  assert.equal(publicIdentityDto(null, null), null);
  const dto = publicIdentityDto(
    {
      logo: {
        url: "https://res.cloudinary.com/c/image/upload/v1/institutional-identity/l.png",
        publicId: "institutional-identity/l",
      },
      mission: "M",
    },
    new Date("2026-01-02T03:04:05Z"),
  );
  assert.ok(dto);
  assert.equal(dto.logo.publicId, null);
  assert.equal(dto.publishedAt, "2026-01-02T03:04:05.000Z");
});

test("publicIdentityDto: contenido publicado vacío → null", () => {
  assert.equal(publicIdentityDto(emptyContent(), new Date()), null);
});

test("isOwnedPublicId: solo acepta nuestra carpeta", () => {
  assert.equal(isOwnedPublicId("institutional-identity/logo"), true);
  assert.equal(isOwnedPublicId("donation-proofs/x"), false);
  assert.equal(isOwnedPublicId(null), false);
});

test("isSafeImageUrl / isSafeLinkUrl", () => {
  assert.equal(isSafeImageUrl("https://x/y.png"), true);
  assert.equal(isSafeImageUrl("data:image/png;base64,AAAA"), false);
  assert.equal(isSafeLinkUrl("/campanas"), true);
  assert.equal(isSafeLinkUrl("javascript:alert(1)"), false);
  assert.equal(isSafeLinkUrl(""), true);
});

// ─── V18: favicon y gestión de activos (reemplazo sin huérfanos) ─────────────

test("V18: normalizeContent conserva el favicon y su publicId", () => {
  const c = normalizeContent({
    favicon: {
      url: "https://res.cloudinary.com/c/image/upload/v1/institutional-identity/favicon/x.png",
      publicId: "institutional-identity/favicon/x",
    },
  });
  assert.equal(
    c.favicon.url,
    "https://res.cloudinary.com/c/image/upload/v1/institutional-identity/favicon/x.png",
  );
  assert.equal(c.favicon.publicId, "institutional-identity/favicon/x");
});

test("V18: publicIdentityDto incluye el favicon y NO expone publicId", () => {
  const dto = publicIdentityDto(
    {
      favicon: {
        url: "https://res.cloudinary.com/c/image/upload/v1/institutional-identity/favicon/f.png",
        publicId: "institutional-identity/favicon/f",
      },
    },
    new Date("2026-02-01T00:00:00Z"),
  );
  assert.ok(dto);
  assert.equal(dto.favicon.publicId, null);
  assert.match(dto.favicon.url, /favicon\/f\.png$/);
});

test("V18: collectAssetPublicIds reúne logo, portada y favicon (y fotos con extractor)", async () => {
  const { collectAssetPublicIds } = await import("./dist/lib/institutional-identity.mjs");
  const content = normalizeContent({
    logo: { url: "https://x/y.png", publicId: "institutional-identity/logo/a" },
    cover: { desktopUrl: "https://x/z.png", publicId: "institutional-identity/cover/b" },
    favicon: { url: "https://x/f.png", publicId: "institutional-identity/favicon/c" },
    story: {
      photos: ["https://res.cloudinary.com/c/image/upload/v1/institutional-identity/story/p.jpg"],
    },
  });

  assert.deepEqual(collectAssetPublicIds(content).sort(), [
    "institutional-identity/cover/b",
    "institutional-identity/favicon/c",
    "institutional-identity/logo/a",
  ]);

  const withPhotos = collectAssetPublicIds(content, (url) =>
    url.includes("story/p") ? "institutional-identity/story/p" : null,
  );
  assert.equal(withPhotos.includes("institutional-identity/story/p"), true);
});

test("V18: diffRemovedAssets borra el reemplazado pero NUNCA lo que sigue en uso", async () => {
  const { diffRemovedAssets } = await import("./dist/lib/institutional-identity.mjs");
  const before = normalizeContent({
    logo: { url: "https://x/old.png", publicId: "institutional-identity/logo/old" },
    cover: { desktopUrl: "https://x/c.png", publicId: "institutional-identity/cover/keep" },
  });
  const after = normalizeContent({
    logo: { url: "https://x/new.png", publicId: "institutional-identity/logo/new" },
    cover: { desktopUrl: "https://x/c.png", publicId: "institutional-identity/cover/keep" },
  });

  // El logo viejo se reemplazó y ya no se usa → se puede borrar.
  assert.deepEqual(diffRemovedAssets(before, after, null), ["institutional-identity/logo/old"]);
  // Si el contenido publicado TODAVÍA lo referencia, NO se borra.
  assert.deepEqual(diffRemovedAssets(before, after, before), []);
});

test("V18: hasPendingChanges compara borrador y publicado", async () => {
  const { hasPendingChanges } = await import("./dist/lib/institutional-identity.mjs");
  const a = normalizeContent({ mission: "Misión" });
  assert.equal(hasPendingChanges(a, null), true);
  assert.equal(hasPendingChanges(a, a), false);
  assert.equal(hasPendingChanges(normalizeContent({ mission: "Otra" }), a), true);
});

test("V18: isOwnedPublicId solo acepta nuestras carpetas (favicon incluido)", async () => {
  const { isOwnedPublicId } = await import("./dist/lib/institutional-identity.mjs");
  assert.equal(isOwnedPublicId("institutional-identity/favicon/x"), true);
  assert.equal(isOwnedPublicId("institutional-identity/logo/x"), true);
  assert.equal(isOwnedPublicId("campaign-evidence/x"), false);
  assert.equal(isOwnedPublicId(null), false);
});

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

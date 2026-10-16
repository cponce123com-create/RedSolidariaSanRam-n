// Resolución del contenido del CMS en el frontend: el contenido de i18n es el valor
// por DEFECTO y lo publicado solo lo SUPERPONE. Este test fija las dos garantías del
// CMS: (1) los datos estáticos nunca sobrescriben lo publicado y (2) un campo vacío o
// un bloque desactivado no rompen ni ocultan de más.
import { test } from "node:test";
import assert from "node:assert/strict";

const {
  resolveLocale,
  resolveText,
  resolveTextOr,
  cmsBlock,
  isBlockEnabled,
  cmsText,
  cmsLink,
  cmsAsset,
  cmsAssetAlt,
  cmsItems,
  resolveImage,
} = await import("./dist/cms.mjs");

function page(blocks) {
  return { slug: "inicio", publishedAt: "2026-01-01T00:00:00.000Z", blocks };
}

const HERO = {
  id: "hero",
  type: "hero",
  order: 0,
  enabled: true,
  fields: {
    title: { es: "Título publicado", en: "Published title" },
    subtitle: { es: "", en: "" },
    ctaHref: { es: "/como-ayudar", en: "" },
    image: {
      url: "https://res.cloudinary.com/x/image/upload/v1/cms/inicio/a.jpg",
      alt: { es: "Foto", en: "" },
      focus: "50% 30%",
      ratio: "4/3",
    },
  },
};

test("cms(web): el idioma activo se normaliza con respaldo a español", () => {
  assert.equal(resolveLocale("en"), "en");
  assert.equal(resolveLocale("fr"), "es");
  assert.equal(resolveLocale(undefined), "es");
  assert.equal(resolveLocale(null), "es");
});

test("cms(web): un texto bilingüe cae al español si falta la traducción", () => {
  assert.equal(resolveText({ es: "Hola", en: "Hello" }, "en"), "Hello");
  assert.equal(resolveText({ es: "Hola", en: "" }, "en"), "Hola");
  assert.equal(resolveText({ es: "Hola" }, "en"), "Hola");
  assert.equal(resolveText(null, "es"), "");
  assert.equal(resolveTextOr({ es: "", en: "" }, "es", "Defecto"), "Defecto");
});

test("cms(web): sin CMS se usa SIEMPRE el contenido por defecto (i18n)", () => {
  assert.equal(cmsText(null, "hero", "title", "es", "Defecto"), "Defecto");
  assert.equal(cmsText(undefined, "hero", "title", "es", "Defecto"), "Defecto");
  assert.equal(cmsAsset(null, "hero", "image"), null);
  assert.deepEqual(cmsItems(null, "help", "items"), []);
  assert.equal(cmsBlock(null, "hero"), undefined);
});

test("cms(web): lo publicado SUPERPONE al texto por defecto", () => {
  const p = page([HERO]);
  assert.equal(cmsText(p, "hero", "title", "es", "Defecto"), "Título publicado");
  assert.equal(cmsText(p, "hero", "title", "en", "Default"), "Published title");
});

test("cms(web): un campo vacío NO sobrescribe el valor por defecto", () => {
  const p = page([HERO]);
  // subtitle está publicado pero vacío → se mantiene el texto por defecto.
  assert.equal(cmsText(p, "hero", "subtitle", "es", "Subtítulo por defecto"), "Subtítulo por defecto");
});

test("cms(web): los enlaces nunca pueden ser javascript:", () => {
  const p = page([
    { ...HERO, fields: { ...HERO.fields, ctaHref: { es: "javascript:alert(1)", en: "" } } },
  ]);
  assert.equal(cmsLink(p, "hero", "ctaHref", "es", "/seguro"), "/seguro");
  // Ruta interna y https se aceptan.
  assert.equal(cmsLink(page([HERO]), "hero", "ctaHref", "es", "/x"), "/como-ayudar");
});

test("cms(web): el activo de imagen resuelve url, alt, foco y proporción", () => {
  const p = page([HERO]);
  const asset = cmsAsset(p, "hero", "image");
  assert.equal(asset.url, "https://res.cloudinary.com/x/image/upload/v1/cms/inicio/a.jpg");
  assert.equal(asset.focus, "50% 30%");
  assert.equal(asset.ratio, "4/3");
  assert.equal(cmsAssetAlt(asset, "es", "Alt por defecto"), "Foto");
  // Sin traducción en inglés, cae al español.
  assert.equal(cmsAssetAlt(asset, "en", "Default alt"), "Foto");
});

test("cms(web): resolveImage usa el respaldo si el CMS no trae imagen", () => {
  const withCms = resolveImage(cmsAsset(page([HERO]), "hero", "image"), "es", {
    src: "/images/estatica.jpg",
    alt: "Estática",
  });
  assert.equal(withCms.fromCms, true);
  assert.equal(withCms.focus, "50% 30%");

  const fallback = resolveImage(null, "es", { src: "/images/estatica.jpg", alt: "Estática", focus: "50% 50%" });
  assert.equal(fallback.fromCms, false);
  assert.equal(fallback.src, "/images/estatica.jpg");
  assert.equal(fallback.alt, "Estática");
});

test("cms(web): un bloque DESACTIVADO oculta la sección; ausente o sin CMS se muestra", () => {
  // Sin CMS → se muestra por defecto.
  assert.equal(isBlockEnabled(null, "cta"), true);
  // Bloque ausente → se muestra por defecto.
  assert.equal(isBlockEnabled(page([HERO]), "cta"), true);
  // Bloque activo → se muestra.
  assert.equal(isBlockEnabled(page([HERO]), "hero"), true);
  // Bloque desactivado → se OCULTA (así «desactivar un bloque» hace algo real).
  const disabled = page([{ ...HERO, enabled: false }]);
  assert.equal(isBlockEnabled(disabled, "hero"), false);
});

test("cms(web): las listas se leen del CMS y caen a vacío sin CMS", () => {
  const p = page([
    {
      id: "help",
      type: "help",
      order: 1,
      enabled: true,
      fields: {
        items: [
          { title: { es: "Donar", en: "" }, description: { es: "Ayuda", en: "" }, href: { es: "/campanas", en: "" } },
        ],
      },
    },
  ]);
  const items = cmsItems(p, "help", "items");
  assert.equal(items.length, 1);
  assert.equal(resolveText(items[0].title, "es"), "Donar");
  assert.deepEqual(cmsItems(p, "help", "noExiste"), []);
});

// Lógica PURA del CMS institucional: allowlist de bloques/campos, bilingüe con
// respaldo, orden/visibilidad, DTO público sin publicId, borrado diferido de
// activos y —lo más importante— que las CIFRAS no se pueden falsificar desde el
// CMS (los bloques de referencia no admiten números).
import { test } from "node:test";
import assert from "node:assert/strict";

const {
  normalizePage,
  emptyPage,
  validatePage,
  isPageEmpty,
  hasPendingChanges,
  publicPageDto,
  collectAssetPublicIds,
  diffRemovedAssets,
  isOwnedCmsPublicId,
  isCmsPageSlug,
  cmsPageBlockSchema,
  cmsPageIsWired,
  CMS_PAGE_SLUGS,
} = await import("./dist/lib/cms-content.mjs");

test("cms: un slug desconocido no pertenece al CMS", () => {
  assert.equal(isCmsPageSlug("inicio"), true);
  assert.equal(isCmsPageSlug("no-existe"), false);
  assert.equal(normalizePage("no-existe", {}), null);
  assert.ok(CMS_PAGE_SLUGS.includes("inicio"));
  assert.equal(cmsPageIsWired("inicio"), true);
});

test("cms: normaliza TODOS los bloques del esquema aunque no vengan", () => {
  const content = normalizePage("inicio", {});
  const types = content.blocks.map((b) => b.type);
  // El esquema de inicio incluye hero y los bloques de referencia calculados.
  assert.ok(types.includes("hero"));
  assert.ok(types.includes("refStats"));
  assert.ok(types.includes("refCampaigns"));
  // Cada bloque tiene id, enabled y order.
  for (const block of content.blocks) {
    assert.equal(block.id, block.type);
    assert.equal(block.enabled, true);
    assert.equal(typeof block.order, "number");
  }
});

test("cms: ALLOWLIST — se descartan bloques y campos desconocidos", () => {
  const content = normalizePage("inicio", {
    blocks: [
      { type: "hero", fields: { title: { es: "Hola" }, campoInventado: { es: "x" }, onload: "alert(1)" } },
      { type: "bloquePeligroso", fields: { script: "<script>alert(1)</script>" } },
    ],
  });
  const hero = content.blocks.find((b) => b.type === "hero");
  assert.deepEqual(Object.keys(hero.fields).sort(), [
    "ctaHref",
    "ctaHref2",
    "ctaLabel",
    "ctaLabel2",
    "eyebrow",
    "image",
    "subtitle",
    "title",
    "titleAccent",
  ]);
  assert.equal(hero.fields.campoInventado, undefined);
  assert.equal(hero.fields.onload, undefined);
  assert.equal(content.blocks.some((b) => b.type === "bloquePeligroso"), false);
});

test("cms: los textos son bilingües y se recortan", () => {
  const content = normalizePage("historia", {
    blocks: [{ type: "hero", fields: { title: { es: "  Hola  ", en: "Hello" } } }],
  });
  const hero = content.blocks.find((b) => b.type === "hero");
  assert.deepEqual(hero.fields.title, { es: "Hola", en: "Hello" });
});

test("cms: un bloque de referencia NUNCA admite cifras (no se pueden falsificar)", () => {
  const content = normalizePage("inicio", {
    blocks: [
      {
        type: "refStats",
        fields: {
          heading: { es: "Nuestro impacto" },
          totalRecaudado: 999999,
          donors: "100000",
          items: [{ value: 42 }],
        },
      },
    ],
  });
  const stats = content.blocks.find((b) => b.type === "refStats");
  // Solo existen heading y subtitle en el esquema.
  assert.deepEqual(Object.keys(stats.fields).sort(), ["heading", "subtitle"]);
  // Y el número enviado NO sobrevive a la normalización.
  assert.equal(JSON.stringify(stats).includes("999999"), false);
  assert.equal(JSON.stringify(stats).includes("100000"), false);
  assert.equal(JSON.stringify(stats).includes("42"), false);
  // El esquema lo declara como bloque de referencia (para el editor).
  const schema = cmsPageBlockSchema("inicio").find((b) => b.type === "refStats");
  assert.equal(schema.reference, true);
});

test("cms: una cifra en un campo de texto se descarta (no se guarda un número)", () => {
  const content = normalizePage("inicio", {
    blocks: [{ type: "hero", fields: { title: 12345, subtitle: { es: 5 } } }],
  });
  const hero = content.blocks.find((b) => b.type === "hero");
  assert.deepEqual(hero.fields.title, { es: "", en: "" });
  assert.deepEqual(hero.fields.subtitle, { es: "", en: "" });
});

test("cms: solo se aceptan URLs de imagen https y enlaces seguros", () => {
  const content = normalizePage("historia", {
    blocks: [
      {
        type: "imageText",
        fields: {
          image: { url: "javascript:alert(1)", publicId: "cms/historia/x" },
          ctaHref: { es: "javascript:alert(1)" },
        },
      },
    ],
  });
  const block = content.blocks.find((b) => b.type === "imageText");
  assert.equal(block.fields.image.url, "");
  assert.equal(block.fields.image.publicId, null); // sin URL no hay publicId
  assert.deepEqual(block.fields.ctaHref, { es: "", en: "" });
});

test("cms: el HTML enriquecido se sanea (anti-XSS)", () => {
  const content = normalizePage("historia", {
    blocks: [
      {
        type: "richText",
        fields: { html: { es: '<p>Hola</p><script>alert(1)</script><a href="javascript:x">y</a>' } },
      },
    ],
  });
  const html = content.blocks.find((b) => b.type === "richText").fields.html.es;
  assert.equal(html.includes("<script>"), false);
  assert.equal(html.includes("javascript:"), false);
  assert.equal(html.includes("<p>Hola</p>"), true);
});

test("cms: respeta el orden de los bloques y el activado/desactivado", () => {
  const content = normalizePage("inicio", {
    blocks: [
      { type: "cta", enabled: false },
      { type: "hero" },
    ],
  });
  const types = content.blocks.map((b) => b.type);
  assert.equal(types[0], "cta");
  assert.equal(types[1], "hero");
  assert.equal(content.blocks[0].enabled, false);
  // El resto de bloques del esquema se añaden después.
  assert.ok(types.includes("refStats"));
});

test("cms: un botón sin enlace (o al revés) es un error de validación", () => {
  const content = normalizePage("inicio", {
    blocks: [{ type: "hero", fields: { ctaLabel: { es: "Donar" }, ctaHref: { es: "" } } }],
  });
  const errors = validatePage(content);
  assert.ok(errors.length >= 1);
  assert.match(errors.join(" "), /enlace/i);
});

test("cms: el DTO público no expone publicId y marca los bloques desactivados", () => {
  const content = normalizePage("historia", {
    blocks: [
      {
        type: "imageText",
        fields: {
          heading: { es: "Historia" },
          image: { url: "https://res.cloudinary.com/x/image/upload/v1/cms/historia/a.jpg", publicId: "cms/historia/a" },
        },
      },
      { type: "cta", enabled: false, fields: { heading: { es: "Oculto" } } },
    ],
  });
  const dto = publicPageDto("historia", content, new Date("2026-01-01T00:00:00.000Z"));
  assert.ok(dto);
  assert.equal(dto.publishedAt, "2026-01-01T00:00:00.000Z");
  // El bloque DESACTIVADO viaja con enabled=false para que el frontend lo OCULTE
  // (así «desactivar un bloque» hace algo de verdad).
  const cta = dto.blocks.find((b) => b.type === "cta");
  assert.ok(cta);
  assert.equal(cta.enabled, false);
  // Un bloque ACTIVO pero VACÍO se envía igualmente (el frontend usa i18n para él).
  const rich = dto.blocks.find((b) => b.type === "richText");
  assert.ok(rich);
  assert.equal(rich.enabled, true);
  const imageBlock = dto.blocks.find((b) => b.type === "imageText");
  assert.equal(imageBlock.fields.image.publicId, undefined);
  // El identificador interno no viaja al público: ni la clave `publicId`.
  assert.equal(JSON.stringify(dto).includes('"publicId"'), false);
});

test("cms: sin nada publicado el DTO es null (el frontend usa i18n)", () => {
  assert.equal(publicPageDto("inicio", null, null), null);
  assert.equal(publicPageDto("inicio", emptyPage("inicio"), null), null);
  assert.equal(isPageEmpty(emptyPage("inicio")), true);
});

test("cms: cambios pendientes = borrador distinto de lo publicado", () => {
  const draft = normalizePage("inicio", { blocks: [{ type: "hero", fields: { title: { es: "Nuevo" } } }] });
  assert.equal(hasPendingChanges(draft, null), true);
  assert.equal(hasPendingChanges(draft, draft), false);
});

test("cms: activos — se recogen publicIds y se difiere el borrado", () => {
  const withA = normalizePage("historia", {
    blocks: [
      {
        type: "imageText",
        fields: {
          heading: { es: "x" },
          image: { url: "https://res.cloudinary.com/x/image/upload/v1/cms/historia/a.jpg", publicId: "cms/historia/a" },
        },
      },
    ],
  });
  const withB = normalizePage("historia", {
    blocks: [
      {
        type: "imageText",
        fields: {
          heading: { es: "x" },
          image: { url: "https://res.cloudinary.com/x/image/upload/v1/cms/historia/b.jpg", publicId: "cms/historia/b" },
        },
      },
    ],
  });

  assert.deepEqual(collectAssetPublicIds(withA), ["cms/historia/a"]);
  // Al reemplazar a→b, el borrador anterior ya no se usa y b sí: se borra a.
  assert.deepEqual(diffRemovedAssets(withA, withB, null), ["cms/historia/a"]);
  // Pero si lo publicado sigue usando a, NO se borra.
  assert.deepEqual(diffRemovedAssets(withA, withB, withA), []);

  // Solo se consideran nuestros los activos de la carpeta cms/.
  assert.equal(isOwnedCmsPublicId("cms/historia/a"), true);
  assert.equal(isOwnedCmsPublicId("institutional-identity/logo/x"), false);
  assert.equal(isOwnedCmsPublicId(null), false);
});

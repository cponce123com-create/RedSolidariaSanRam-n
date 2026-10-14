// Datos estructurados (JSON-LD): construcción y serialización segura.
import { test } from "node:test";
import assert from "node:assert/strict";

const {
  DEFAULT_LOGO_PATH,
  DEFAULT_PUBLIC_URL,
  absoluteUrl,
  buildOrganizationJsonLd,
  buildSiteJsonLd,
  buildWebsiteJsonLd,
  resolvePublicBaseUrl,
  serializeJsonLd,
} = await import("./dist/structured-data.mjs");

test("URL pública: sin barras finales y con valor por defecto", () => {
  assert.equal(resolvePublicBaseUrl("https://ejemplo.org/"), "https://ejemplo.org");
  assert.equal(resolvePublicBaseUrl("  https://ejemplo.org//  "), "https://ejemplo.org");
  assert.equal(resolvePublicBaseUrl(""), DEFAULT_PUBLIC_URL);
  assert.equal(resolvePublicBaseUrl(undefined), DEFAULT_PUBLIC_URL);
  assert.equal(resolvePublicBaseUrl(42), DEFAULT_PUBLIC_URL);
  assert.equal(DEFAULT_PUBLIC_URL, "https://redsolidariasanramon.org");
});

test("URL absoluta: une base y ruta sin dobles barras y respeta las absolutas", () => {
  assert.equal(absoluteUrl("https://ejemplo.org", "/opengraph.jpg"), "https://ejemplo.org/opengraph.jpg");
  assert.equal(absoluteUrl("https://ejemplo.org/", "opengraph.jpg"), "https://ejemplo.org/opengraph.jpg");
  assert.equal(absoluteUrl("https://ejemplo.org", "https://cdn.org/x.png"), "https://cdn.org/x.png");
  assert.equal(absoluteUrl("https://ejemplo.org", ""), "https://ejemplo.org");
  assert.equal(absoluteUrl("https://ejemplo.org", null), "https://ejemplo.org");
});

test("organización: ONG con nombre, url, logo absoluto y descripción", () => {
  const data = buildOrganizationJsonLd({
    siteName: "Red Solidaria San Ramón",
    description: "Ayuda comunitaria",
  });
  assert.equal(data["@context"], "https://schema.org");
  assert.equal(data["@type"], "NGO");
  assert.equal(data.name, "Red Solidaria San Ramón");
  assert.equal(data.url, DEFAULT_PUBLIC_URL);
  assert.equal(data.logo, `${DEFAULT_PUBLIC_URL}${DEFAULT_LOGO_PATH}`);
  assert.equal(data.description, "Ayuda comunitaria");
});

test("organización: usa la URL pública configurada", () => {
  const data = buildOrganizationJsonLd({
    siteName: "X",
    description: "Y",
    baseUrl: "https://otro.example/",
  });
  assert.equal(data.url, "https://otro.example");
  assert.equal(data.logo, "https://otro.example/images/logo.webp");
});

test("sitio web: nombre, url e idioma por defecto", () => {
  const data = buildWebsiteJsonLd({ siteName: "Red Solidaria", description: "d" });
  assert.equal(data["@type"], "WebSite");
  assert.equal(data.name, "Red Solidaria");
  assert.equal(data.url, DEFAULT_PUBLIC_URL);
  assert.equal(data.inLanguage, "es");
});

test("portada: publica organización y sitio, en ese orden", () => {
  const blocks = buildSiteJsonLd({ siteName: "R", description: "d" });
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0]["@type"], "NGO");
  assert.equal(blocks[1]["@type"], "WebSite");
});

test("serialización: escapa lo que podría cerrar la etiqueta script", () => {
  const serialized = serializeJsonLd({ name: "</script><img src=x onerror=alert(1)>" });
  assert.equal(serialized.includes("</script>"), false);
  assert.equal(serialized.includes("<"), false);
  assert.equal(serialized.includes(String.raw`\u003c`), true);
});

test("serialización: el resultado sigue siendo JSON válido e idéntico", () => {
  const original = {
    "@context": "https://schema.org",
    "@type": "NGO",
    name: "Red & Solidaria <San Ramón>",
    nested: { list: [1, 2, "áé\u2028"] },
  };
  const roundTrip = JSON.parse(serializeJsonLd(original));
  assert.deepEqual(roundTrip, original);
});

test("serialización: tolera valores vacíos sin romper", () => {
  assert.equal(serializeJsonLd(undefined), "null");
  assert.equal(serializeJsonLd(null), "null");
  assert.equal(serializeJsonLd([]), "[]");
});

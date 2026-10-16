// Sanitizador de texto enriquecido (Fase 3/5 — anti-XSS en «Nuestra historia»).
//
// El editor produce HTML que se guarda y se muestra en la web pública. Sin
// saneado sería un XSS almacenado. Esta prueba fija la política de allowlist.
import { test } from "node:test";
import assert from "node:assert/strict";

const { sanitizeRichText } = await import("./dist/lib/rich-text.mjs");

test("conserva el formato permitido sin alterarlo", () => {
  const html = "<p>Hola <strong>mundo</strong> y <em>más</em></p>";
  assert.equal(sanitizeRichText(html), html);
});

test("elimina <script> CON su contenido (XSS almacenado)", () => {
  const out = sanitizeRichText('<p>Hola</p><script>alert("xss")</script>');
  assert.equal(out, "<p>Hola</p>");
  assert.doesNotMatch(out, /script/i);
  assert.doesNotMatch(out, /alert/);
});

test("elimina atributos de eventos on*", () => {
  const out = sanitizeRichText('<p onclick="alert(1)">Texto</p>');
  assert.equal(out, "<p>Texto</p>");
  assert.doesNotMatch(out, /onclick/);
});

test("rechaza enlaces javascript: y conserva los seguros", () => {
  assert.equal(sanitizeRichText('<a href="javascript:alert(1)">x</a>'), "<a>x</a>");
  const safe = sanitizeRichText('<a href="https://redsolidaria.org">x</a>');
  assert.match(safe, /href="https:\/\/redsolidaria\.org"/);
  assert.match(safe, /rel="noopener noreferrer"/);
});

test("elimina iframes, estilos y comentarios", () => {
  const out = sanitizeRichText(
    '<iframe src="x"></iframe><style>p{color:red}</style><!-- oculto --><p>ok</p>',
  );
  assert.equal(out, "<p>ok</p>");
});

test("descarta etiquetas no permitidas conservando su texto", () => {
  assert.equal(sanitizeRichText("<div>texto</div>"), "texto");
});

test("entradas no-cadena devuelven cadena vacía", () => {
  assert.equal(sanitizeRichText(null), "");
  assert.equal(sanitizeRichText(undefined), "");
  assert.equal(sanitizeRichText(42), "");
});

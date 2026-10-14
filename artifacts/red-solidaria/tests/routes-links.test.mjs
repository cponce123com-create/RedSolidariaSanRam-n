// Enlaces internos y rutas existentes (Fase 7, V7.1, "corregir enlaces y
// páginas inexistentes").
//
// Prueba estática: extrae las rutas declaradas en App.tsx y comprueba que TODO
// enlace interno (href="/..." o href={`/...`}) de src/**/*.tsx apunta a una ruta
// real, para no publicar un enlace que lleve a la página 404. Los enlaces
// externos, los anclas (#) y mailto/tel se ignoran.
//
// Se evita el uso de expresiones regulares con barras invertidas (el escáner es
// de texto plano) para que la prueba sea legible y no dependa del escapado.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SRC_RAW = fileURLToPath(new URL("../src/", import.meta.url));
const SRC = SRC_RAW.endsWith("/") ? SRC_RAW.slice(0, -1) : SRC_RAW;

/** Devuelve el texto entre `marker` y su cierre (`"` o backtick). */
function scanValues(content, marker, closer) {
  const values = [];
  let index = content.indexOf(marker);
  while (index !== -1) {
    const start = index + marker.length;
    const end = content.indexOf(closer, start);
    if (end === -1) break;
    values.push(content.slice(start, end));
    index = content.indexOf(marker, end + 1);
  }
  return values;
}

function readRoutes() {
  const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  return scanValues(app, 'path="', '"');
}

function extractLinks(content) {
  return [
    ...scanValues(content, 'href="', '"'),
    ...scanValues(content, 'href={"', '"'),
    ...scanValues(content, "href={`", "`"),
  ];
}

function walk(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const full = `${dir}/${entry}`;
    if (statSync(full).isDirectory()) files.push(...walk(full));
    else if (entry.endsWith(".tsx") || entry.endsWith(".ts")) files.push(full);
  }
  return files;
}

/** Sustituye las variables de plantilla `${...}` por un segmento comodín "X". */
function normalize(href) {
  let out = "";
  let i = 0;
  while (i < href.length) {
    if (href[i] === "$" && href[i + 1] === "{") {
      const end = href.indexOf("}", i);
      if (end !== -1) {
        out += "X";
        i = end + 1;
        continue;
      }
    }
    out += href[i];
    i += 1;
  }
  return out.split("?")[0].split("#")[0];
}

function isInternal(href) {
  // Los enlaces a /api/... son endpoints del backend (p. ej. la descarga de
  // discrepancias del libro), no rutas de la SPA.
  return href.startsWith("/") && !href.startsWith("//") && !href.startsWith("/api/");
}

/** ¿La ruta (con :param) casa con el enlace? Comparación segmento a segmento. */
function routeMatches(route, href) {
  const routeSegments = route.split("/");
  const hrefSegments = href.split("/");
  if (routeSegments.length !== hrefSegments.length) return false;
  for (let i = 0; i < routeSegments.length; i += 1) {
    const segment = routeSegments[i];
    if (segment.startsWith(":")) continue;
    if (segment !== hrefSegments[i]) return false;
  }
  return true;
}

const routes = readRoutes();

function matchesAnyRoute(href) {
  const clean = normalize(href);
  return routes.some((route) => routeMatches(route, clean));
}

test("las rutas de App.tsx se extraen (hay un mapa de rutas real)", () => {
  assert.ok(routes.length > 20, `rutas encontradas: ${routes.length}`);
  assert.ok(routes.includes("/admin/campanas"), "falta /admin/campanas");
  assert.ok(routes.includes("/aliados"), "falta /aliados");
});

test("todo enlace interno apunta a una ruta declarada (no hay enlaces rotos)", () => {
  const broken = [];
  for (const file of walk(SRC)) {
    const content = readFileSync(file, "utf8");
    for (const href of extractLinks(content)) {
      if (!isInternal(href)) continue;
      if (!matchesAnyRoute(href)) {
        broken.push(`${file.replace(SRC, "src")} -> ${href}`);
      }
    }
  }
  assert.deepEqual(broken, [], `Enlaces internos sin ruta: ${broken.join(" | ")}`);
});

test("routeMatches: un parametro casa con un segmento y no con dos", () => {
  assert.equal(routeMatches("/campanas/:id", "/campanas/42"), true);
  assert.equal(routeMatches("/campanas/:id", "/campanas/42/transparencia"), false);
  assert.equal(routeMatches("/campanas/:id", "/campanas"), false);
});

test("normalize: quita query, hash y variables de plantilla", () => {
  assert.equal(normalize("/campanas?x=1#y"), "/campanas");
  assert.equal(normalize("/admin/campanas/${id}"), "/admin/campanas/X");
});

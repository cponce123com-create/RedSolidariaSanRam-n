import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import express from "express";
import helmet from "helmet";

const { buildCspDirectives, extractInlineExecutableScripts, sha256Base64 } =
  await import("./dist/lib/csp.mjs");

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const INDEX_HTML = path.join(ROOT, "../red-solidaria/index.html");

test("en desarrollo se mantiene unsafe-inline y unsafe-eval (Vite HMR)", () => {
  const d = buildCspDirectives({ isDev: true });
  assert.ok(d.scriptSrc.includes("'unsafe-inline'"));
  assert.ok(d.scriptSrc.includes("'unsafe-eval'"));
  assert.deepEqual(d.scriptSrcAttr, ["'unsafe-inline'"]);
});

test("en producción scriptSrc no tiene unsafe-inline/unsafe-eval y scriptSrcAttr es 'none'", () => {
  const d = buildCspDirectives({ isDev: false, indexHtmlPath: INDEX_HTML });
  assert.ok(!d.scriptSrc.includes("'unsafe-inline'"));
  assert.ok(!d.scriptSrc.includes("'unsafe-eval'"));
  assert.deepEqual(d.scriptSrcAttr, ["'none'"]);
});

test("el hash sha256 coincide con node:crypto para un script inline conocido", () => {
  const html = `<html><head><script>
      var x = 1;
    </script></head></html>`;
  const [content] = extractInlineExecutableScripts(html);
  const expected = createHash("sha256").update(content, "utf8").digest("base64");
  assert.equal(sha256Base64(content), expected);

  // Sin index.html disponible → sin hashes (el servidor loguea un warning).
  const d = buildCspDirectives({ isDev: false });
  assert.ok(!d.scriptSrc.some((s) => s.startsWith("'sha256-")));
});

test("todo script inline ejecutable del index.html real queda cubierto por un hash", () => {
  const html = readFileSync(INDEX_HTML, "utf8");
  const d = buildCspDirectives({ isDev: false, indexHtmlPath: INDEX_HTML });
  const hashes = new Set(d.scriptSrc.filter((s) => s.startsWith("'sha256-")));

  const inlineScripts = extractInlineExecutableScripts(html);
  assert.ok(inlineScripts.length >= 1, "se espera al menos el script anti-FOUC");
  for (const content of inlineScripts) {
    assert.ok(
      hashes.has(`'sha256-${sha256Base64(content)}'`),
      "hay un script inline sin hash en la política CSP",
    );
  }
});

test("el index.html no contiene atributos on* (script-src-attr 'none' en producción)", () => {
  const html = readFileSync(INDEX_HTML, "utf8");
  assert.doesNotMatch(html, /\son[a-z]+\s*=/i);
});

test("helmet sirve la cabecera CSP con sha256 y sin unsafe-inline en script-src", async () => {
  const app = express();
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: buildCspDirectives({ isDev: false, indexHtmlPath: INDEX_HTML }),
      },
    }),
  );
  app.get("/", (_req, res) => res.send("ok"));

  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const { port } = server.address();
  try {
    const res = await fetch(`http://127.0.0.1:${port}/`);
    const csp = res.headers.get("content-security-policy") ?? "";
    assert.ok(csp.includes("script-src 'self' 'sha256-"), `CSP inesperada: ${csp}`);
    assert.ok(csp.includes("script-src-attr 'none'"), `CSP inesperada: ${csp}`);

    // 'unsafe-inline' se conserva solo en style-src (React inline styles);
    // script-src y script-src-attr NO deben tenerlo.
    const scriptSrcValue = csp.match(/script-src ([^;]+)/)?.[1] ?? "";
    assert.ok(
      !scriptSrcValue.includes("'unsafe-inline'"),
      `script-src con unsafe-inline: ${scriptSrcValue}`,
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

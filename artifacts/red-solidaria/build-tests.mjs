// Compila los módulos de lógica pura del frontend a JS para que node:test
// funcione en cualquier versión de Node (mismo patrón que
// artifacts/api-server/build-tests.mjs).
import { build } from "esbuild";
import { rmSync } from "node:fs";

rmSync("tests/dist", { recursive: true, force: true });

await build({
  entryPoints: [
    "./src/lib/campaign-urgency.ts",
    "./src/lib/i18n/locales/es.ts",
    "./src/lib/i18n/locales/en.ts",
  ],
  bundle: true,
  platform: "node",
  format: "esm",
  outdir: "tests/dist",
  outExtension: { ".js": ".mjs" },
  logLevel: "silent",
});

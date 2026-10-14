// Compila los módulos de lógica pura del frontend a JS para que node:test
// funcione en cualquier versión de Node (mismo patrón que
// artifacts/api-server/build-tests.mjs).
import { build } from "esbuild";
import { rmSync } from "node:fs";

rmSync("tests/dist", { recursive: true, force: true });

await build({
  entryPoints: [
    "./src/lib/campaign-urgency.ts",
    "./src/lib/chocofest.ts",
    "./src/lib/inventory.ts",
    "./src/lib/results.ts",
    "./src/lib/donors-admin.ts",
    "./src/lib/audit-admin.ts",
    "./src/lib/reports-admin.ts",
    "./src/lib/observations-admin.ts",
    "./src/lib/volunteers-admin.ts",
    "./src/lib/volunteer-teams-admin.ts",
    "./src/lib/query-keys.ts",
    "./src/lib/query-invalidation.ts",
    "./src/lib/budget.ts",
    "./src/lib/baskets.ts",
    "./src/lib/admin-access.ts",
    "./src/lib/whatsapp.ts",
    "./src/lib/event-results.ts",
    "./src/lib/admin-session.ts",
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

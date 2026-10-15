import { build } from "esbuild";
import { rmSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import esbuildPluginPino from "esbuild-plugin-pino";

// Los plugins (esbuild-plugin-pino) usan require para resolver dependencias.
globalThis.require = createRequire(import.meta.url);
globalThis.__filename = fileURLToPath(import.meta.url);
globalThis.__dirname = new URL(".", import.meta.url).pathname;

// Limpia salidas previas para no dejar módulos stale que rompan los tests
rmSync("tests/dist", { recursive: true, force: true });

// Compila los módulos bajo test a JS puro para que node:test funcione
// en cualquier versión de Node (sin depender de type-stripping).
await build({
  entryPoints: [
    "./src/middleware/require-admin.ts",
    "./src/middleware/roles.ts",
    "./src/middleware/rate-limit.ts",
    "./src/middleware/cache-control.ts",
    "./src/lib/cloudinary.ts",
    "./src/lib/donor-format.ts",
    "./src/lib/amount-format.ts",
    "./src/lib/donation-validation.ts",
    "./src/lib/funding.ts",
    "./src/lib/certificates.ts",
    "./src/lib/dashboard-filters.ts",
    "./src/lib/chocofest-2025-data.ts",
    "./src/lib/totp.ts",
    "./src/lib/two-factor-lockout.ts",
    "./src/lib/random-password.ts",
    "./src/lib/csp.ts",
    "./src/lib/security-config.ts",
    "./src/lib/ledger.ts",
    "./src/lib/ledger-audit.ts",
    "./src/lib/ledger-regularization.ts",
    "./src/lib/donation-reconcile.ts",
    "./src/lib/pg-errors.ts",
    "./src/lib/campaign-lifecycle.ts",
    "./src/lib/campaign-demo-purge.ts",
    "./src/lib/demo-classification.ts",
    "./src/lib/demo-inventory.ts",
    "./src/lib/expense-cleanup.ts",
    "./src/lib/admin-reauth.ts",
    "./src/lib/two-factor-account.ts",
    "./src/lib/asset-cleanup.ts",
    "./src/lib/donor-consent.ts",
    "./src/lib/donation-annulment.ts",
    "./src/lib/donor-identity.ts",
    "./src/lib/public-settings.ts",
    "./src/lib/audit.ts",
    "./src/lib/csv.ts",
    "./src/lib/supervisor.ts",
    "./src/lib/volunteer-lifecycle.ts",
    "./src/lib/volunteer-teams.ts",
    "./src/routes/volunteers.ts",
    "./src/routes/volunteer-teams.ts",
    "./src/routes/audit-logs.ts",
    "./src/routes/ledger-audit.ts",
    "./src/routes/maintenance.ts",
    "./src/routes/index.ts",
    "./src/routes/reports.ts",
    "./src/routes/supervisor.ts",
    "./src/routes/stats.ts",
    "./src/routes/sitemap.ts",
    "./src/routes/settings.ts",
    "./src/routes/campaigns.ts",
    "./src/routes/campaign-movements.ts",
    "./src/routes/allies.ts",
    "./src/routes/donations.ts",
    "./src/routes/donors.ts",
    "./src/routes/volunteers.ts",
    "./src/routes/pets.ts",
    "./src/routes/community-reports.ts",
    "./src/routes/admin-users.ts",
    "./src/routes/admin-2fa.ts",
    "./src/routes/campaign-evidence.ts",
    "./src/routes/campaign-expenses.ts",
    "./src/routes/campaign-leftovers.ts",
    "./src/routes/campaign-budgets.ts",
    "./src/routes/campaign-transparency.ts",
    "./src/routes/health.ts",
  ],
  bundle: true,
  platform: "node",
  format: "esm",
  outdir: "tests/dist",
  outExtension: { ".js": ".mjs" },
  logLevel: "silent",
  plugins: [
    // pino (via logger de auth-utils) usa workers para logging; el plugin
    // copia los workers (thread-stream) junto a los outputs del bundle.
    esbuildPluginPino({ transports: ["pino-pretty"] }),
    // El lockout 2FA se mantiene como módulo compartido (no inline) dentro del
    // bundle de admin-2fa: así la ruta y los tests usan la misma instancia del
    // store en memoria y el test HTTP del 429 puede sembrar el bloqueo.
    {
      name: "external-two-factor-lockout",
      setup(build) {
        build.onResolve({ filter: /two-factor-lockout$/ }, (args) => {
          if (args.importer && /\/routes\/admin-2fa\.ts$/.test(args.importer)) {
            return { path: "../lib/two-factor-lockout.mjs", external: true };
          }
          return undefined;
        });
      },
    },
  ],
  // Mismo banner que build.mjs: permite que los require dinámicos de paquetes
  // CJS (p.ej. express) funcionen en el bundle ESM via createRequire.
  banner: {
    js: `import { createRequire as __bannerCrReq } from 'node:module';\nimport __bannerPath from 'node:path';\nimport __bannerUrl from 'node:url';\n\nglobalThis.require = __bannerCrReq(import.meta.url);\nglobalThis.__filename = __bannerUrl.fileURLToPath(import.meta.url);\nglobalThis.__dirname = __bannerPath.dirname(globalThis.__filename);\n    `,
  },
});

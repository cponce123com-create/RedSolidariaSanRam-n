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
    "./src/lib/totp.ts",
    "./src/lib/ledger.ts",
    "./src/routes/stats.ts",
    "./src/routes/sitemap.ts",
    "./src/routes/campaign-movements.ts",
    "./src/routes/allies.ts",
    "./src/routes/donations.ts",
    "./src/routes/admin-users.ts",
    "./src/routes/admin-2fa.ts",
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
  ],
  // Mismo banner que build.mjs: permite que los require dinámicos de paquetes
  // CJS (p.ej. express) funcionen en el bundle ESM via createRequire.
  banner: {
    js: `import { createRequire as __bannerCrReq } from 'node:module';\nimport __bannerPath from 'node:path';\nimport __bannerUrl from 'node:url';\n\nglobalThis.require = __bannerCrReq(import.meta.url);\nglobalThis.__filename = __bannerUrl.fileURLToPath(import.meta.url);\nglobalThis.__dirname = __bannerPath.dirname(globalThis.__filename);\n    `,
  },
});

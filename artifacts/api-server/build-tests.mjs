import { build } from "esbuild";
import { rmSync } from "node:fs";

// Limpia salidas previas para no dejar módulos stale que rompan los tests
rmSync("tests/dist", { recursive: true, force: true });

// Compila los módulos bajo test a JS puro para que node:test funcione
// en cualquier versión de Node (sin depender de type-stripping).
await build({
  entryPoints: [
    "./src/middleware/require-admin.ts",
    "./src/middleware/rate-limit.ts",
    "./src/lib/cloudinary.ts",
    "./src/lib/donor-format.ts",
    "./src/lib/totp.ts",
    "./src/routes/stats.ts",
    "./src/routes/sitemap.ts",
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
  // Mismo banner que build.mjs: permite que los require dinámicos de paquetes
  // CJS (p.ej. express) funcionen en el bundle ESM via createRequire.
  banner: {
    js: `import { createRequire as __bannerCrReq } from 'node:module';\nimport __bannerPath from 'node:path';\nimport __bannerUrl from 'node:url';\n\nglobalThis.require = __bannerCrReq(import.meta.url);\nglobalThis.__filename = __bannerUrl.fileURLToPath(import.meta.url);\nglobalThis.__dirname = __bannerPath.dirname(globalThis.__filename);\n    `,
  },
});

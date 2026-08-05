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
  ],
  bundle: true,
  platform: "node",
  format: "esm",
  outdir: "tests/dist",
  outExtension: { ".js": ".mjs" },
  logLevel: "silent",
});

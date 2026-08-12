import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { brotliCompressSync, constants as zlibConstants, gzipSync } from "node:zlib";
import runtimeErrorModal from "@replit/vite-plugin-runtime-error-modal";

// PORT y BASE_PATH los inyectan Replit y el script dev del root; fuera de esos
// entornos (p.ej. el build de Render) usamos valores por defecto para que el
// build del frontend nunca falle por configuración de entorno.
const rawPort = process.env.PORT || "5173";

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH || "/";

// Precarga el chunk de la página inicial (home) en index.html. El navegador
// descarga el bundle principal (~676 kB) ANTES de pedir el chunk lazy del home
// (49 kB); con <link rel="modulepreload"> ambos se descargan en paralelo y el
// primer paint del home llega sensiblemente antes en redes lentas.
// No toca manualChunks (históricamente rompió la app en producción).
function preloadHomeChunk(): Plugin {
  return {
    name: "preload-home-chunk",
    apply: "build",
    closeBundle() {
      const outDir = path.resolve(import.meta.dirname, "dist/public");
      const htmlPath = path.join(outDir, "index.html");
      const assetsDir = path.join(outDir, "assets");
      let html: string;
      let homeChunk: string | undefined;
      try {
        html = readFileSync(htmlPath, "utf8");
        homeChunk = readdirSync(assetsDir).find((f) => /^home-.*\.js$/.test(f));
      } catch {
        return; // build sin home o sin index.html: no hacemos nada
      }
      if (!homeChunk || html.includes(homeChunk)) return;
      const base = basePath.endsWith("/") ? basePath : `${basePath}/`;
      const link = `    <link rel="modulepreload" href="${base}assets/${homeChunk}" />\n`;
      writeFileSync(htmlPath, html.replace("<head>", `<head>\n${link}`));
    },
  };
}

// Genera .gz y .br junto a cada asset .js/.css. Express los sirve con el
// Content-Encoding que acepte el cliente: brotli (~15-20% más pequeño que
// gzip) se prefiere cuando el navegador lo soporta. Sin esto el bundle de
// ~676 kB viajaría crudo.
function precompressBuildAssets(): Plugin {
  return {
    name: "precompress-build-assets",
    apply: "build",
    closeBundle() {
      const assetsDir = path.resolve(import.meta.dirname, "dist/public/assets");
      let files: string[];
      try {
        files = readdirSync(assetsDir);
      } catch {
        return;
      }
      for (const f of files) {
        if (!/\.(js|css)$/.test(f) || f.endsWith(".gz") || f.endsWith(".br")) continue;
        const src = readFileSync(path.join(assetsDir, f));
        writeFileSync(path.join(assetsDir, `${f}.gz`), gzipSync(src, { level: 9 }));
        writeFileSync(
          path.join(assetsDir, `${f}.br`),
          brotliCompressSync(src, {
            params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 11 },
          }),
        );
      }
    },
  };
}

export default defineConfig(async ({ mode }) => ({
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
    runtimeErrorModal(),
    preloadHomeChunk(),
    precompressBuildAssets(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, ".."),
            }),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
      // Fuerza UNA única copia de React en dev (pre-bundle y módulos): evita el
      // error de runtime "Cannot set properties of undefined (setting 'Children')"
      // por dos copias de React o interop CJS/ESM rota en la caché de optimizeDeps.
      react: path.resolve(import.meta.dirname, "node_modules", "react"),
      "react-dom": path.resolve(import.meta.dirname, "node_modules", "react-dom"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    target: "esnext",
    minify: "esbuild",
    // Sourcemaps SOLO en desarrollo: en producción exponen el código fuente
    // completo (~7 MB de .map servidos públicamente en /assets/*.map) y
    // duplican el peso del deploy. Los .map en dev permiten debuggear.
    sourcemap: mode === "development",
    // Split de vendor. Históricamente, partir react/react-dom en chunks
    // separados de sus consumidores CJS (p.ej. @tanstack/react-query →
    // use-sync-external-store/shim) creaba imports circulares entre chunks y
    // los consumidores llamaban a React en el top-level ANTES de que el chunk
    // de React inicializara → página en blanco en producción.
    // El split SEGURO agrupa react + react-dom + scheduler + react-redux +
    // react-is + hoist-non-react-statics + use-sync-external-store +
    // @tanstack/react-query en UN solo chunk (vendor-react): todos los
    // consumidores CJS de React comparten chunk con React, sin llamadas
    // top-level entre chunks distintos y sin ciclos (verificado en build).
    // framer-motion/lucide-react (ESM puro) van a vendor-ui. El resto de
    // node_modules queda en el entry (como el build original): un bucket
    // catch-all "vendor" crea ciclos vendor ↔ vendor-react y arrastra
    // dependencias lazy (recharts/leaflet) a la carga inicial (+40% bytes).
    chunkSizeWarningLimit: 500,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (
            id.includes("/react/") ||
            id.includes("/react-dom/") ||
            id.includes("/scheduler/") ||
            id.includes("/react-redux/") ||
            id.includes("/use-sync-external-store/") ||
            id.includes("/@tanstack/react-query/") ||
            id.includes("/react-is/") ||
            id.includes("/hoist-non-react-statics/")
          ) {
            return "vendor-react";
          }
          if (
            id.includes("/framer-motion/") ||
            id.includes("/motion-dom/") ||
            id.includes("/motion-utils/") ||
            id.includes("/lucide-react/")
          ) {
            return "vendor-ui";
          }
          return undefined;
        },
      },
    },
  },
  server: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
  optimizeDeps: {
    include: [
      "react",
      "react-dom",
      "wouter",
      "@tanstack/react-query",
      // react-redux (vía recharts 3 en la raíz) + su shim de useSyncExternalStore:
      // se pre-bundlean contra el react único del alias para evitar la interop
      // CJS/ESM rota ("Cannot set properties of undefined (setting 'Children')").
      "react-redux",
      "use-sync-external-store",
    ],
  },
}));

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
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

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
    runtimeErrorModal(),
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
    sourcemap: true,
    // NO usar manualChunks personalizado: partir react/react-dom/react-query en
    // chunks separados crea imports circulares entre chunks y los consumidores
    // CJS (p.ej. @tanstack/react-query → use-sync-external-store/shim) llaman a
    // React en el top-level del chunk ANTES de que el chunk de React termine de
    // inicializarse → "Cannot read properties of undefined (reading 'exports')"
    // → página en blanco en producción. Vite ya separa las rutas lazy solas.
    chunkSizeWarningLimit: 500,
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
});

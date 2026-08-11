// Configuración de Vitest para el frontend (Red Solidaria).
// Los tests viven en tests/vitest/ (fuera del include de tsconfig, que solo
// cubre src/**; Vitest los compila con su propio pipeline Vite).
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(root, "src"),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/vitest/setup.ts"],
    include: ["tests/vitest/**/*.test.{ts,tsx}"],
    css: false,
  },
});

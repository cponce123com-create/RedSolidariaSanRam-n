/**
 * Configuración SOLO para `push` (bootstrap de una base de pruebas o local).
 *
 * Las migraciones del proyecto son las VERSIONADAS de `lib/db/src/migrate.ts`, que
 * se aplican al arrancar el servidor. **No se usa `drizzle-kit generate`**: los
 * artefactos que generaba (`lib/db/drizzle/0000_*.sql`, `0001_*.sql`) se
 * eliminaron en V7-16 porque nunca se aplicaban y contradecían al migrador real
 * —un `push` accidental habría reintroducido el `ON DELETE CASCADE` del libro
 * contable—. Si alguna vez se ejecuta `generate`, su salida NO debe commitearse.
 */
import { defineConfig } from "drizzle-kit";
import path from "path";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});

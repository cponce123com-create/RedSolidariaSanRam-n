import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Connection pooling optimizado para producción
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20, // Máximo de conexiones en el pool
  min: 0, // Sin conexiones ociosas: el pooler serverless (Neon) recicla las inactivas
  idleTimeoutMillis: 30000, // Tiempo máximo de inactividad (30s)
  connectionTimeoutMillis: 5000, // Timeout para obtener conexión (5s)
});

// Evitar crash no controlado cuando el pooler cierra una conexión inactiva.
// Sin este listener, un 'error' emitido por el pool derriba el proceso completo.
pool.on("error", (err) => {
  console.error("Unexpected error on idle PostgreSQL connection", err);
});

export const db = drizzle(pool, { schema });

export * from "./schema";

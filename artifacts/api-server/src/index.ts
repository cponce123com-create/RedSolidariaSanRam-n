import app from "./app";
import { logger } from "./lib/logger";
import { seedIfEmpty } from "./lib/seed";
import { runMigrations } from "@workspace/db";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// Arrancar el servidor primero y seedear en paralelo: el servicio responde
// aunque la DB esté lenta o el seed falle (evita downtime durante deploys).
app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});

seedIfEmpty().catch((err) => {
  logger.error({ err }, "Failed to seed database, starting server anyway");
});

runMigrations().catch((err: unknown) => {
  logger.error({ err }, "Failed to run database migrations");
});

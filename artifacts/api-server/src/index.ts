import app from "./app";
import { logger } from "./lib/logger";
import { seedIfEmpty } from "./lib/seed";
import { runMigrations } from "@workspace/db";
import { startLedgerAnchorJob } from "./lib/anchor";

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

// Aplicar migraciones ANTES de escuchar (hallazgo INF-01): si el esquema no se
// puede preparar, el arranque debe fallar de forma explícita (Render reinicia
// el deploy) en vez de atender tráfico contra un esquema desactualizado.
try {
  await runMigrations();
} catch (err) {
  logger.error({ err }, "Failed to run database migrations");
  process.exit(1);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});

// Ledger Trust Pay: ancla el root hash global al arranque y cada 24h.
startLedgerAnchorJob();

// El seed no bloquea el arranque: el servicio responde aunque el seed falle.
seedIfEmpty().catch((err) => {
  logger.error({ err }, "Failed to seed database, starting server anyway");
});

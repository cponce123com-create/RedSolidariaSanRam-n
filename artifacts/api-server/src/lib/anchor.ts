import { db, campaignMovementsTable } from "@workspace/db";
import { asc } from "drizzle-orm";
import { verifyChain } from "./ledger";
import { logger } from "./logger";

/**
 * Anclaje del ledger Trust Pay.
 *
 * Calcula el root hash GLOBAL (todas las campañas) y lo publica:
 * - siempre lo registra en el log (audit trail),
 * - si `ANCHOR_WEBHOOK_URL` está configurado, hace POST del root hash a ese
 *   endpoint (p. ej. un servicio de prueba de existencia, una red tipo
 *   Bitcoin OP_RETURN vía proveedor, o un notifier interno). El anclaje
 *   externo convierte el root hash en una prueba criptográfica fechada.
 *
 * Frecuencia por defecto: 24 h (LEDGER_ANCHOR_INTERVAL_MS para override).
 */

export async function computeLedgerRootHash(): Promise<{
  rootHash: string | null;
  count: number;
  verified: boolean;
  computedAt: string;
}> {
  const rows = await db
    .select()
    .from(campaignMovementsTable)
    .orderBy(asc(campaignMovementsTable.id));
  const result = verifyChain(rows);
  return {
    rootHash: result.rootHash,
    count: result.count,
    verified: result.verified,
    computedAt: new Date().toISOString(),
  };
}

async function runAnchor(): Promise<void> {
  try {
    const anchor = await computeLedgerRootHash();
    logger.info(
      { rootHash: anchor.rootHash, count: anchor.count, verified: anchor.verified },
      "Ledger anchor (root hash global)",
    );

    const webhookUrl = process.env.ANCHOR_WEBHOOK_URL;
    if (webhookUrl && anchor.rootHash) {
      await fetch(webhookUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(anchor),
      }).catch((err) => {
        logger.error({ err, webhookUrl }, "Ledger anchor webhook failed");
      });
    }
  } catch (err) {
    logger.error({ err }, "Ledger anchor failed");
  }
}

export function startLedgerAnchorJob(): void {
  runAnchor(); // ancla al arrancar
  const intervalMs = Number(process.env.LEDGER_ANCHOR_INTERVAL_MS) || 24 * 60 * 60 * 1000;
  // unref(): no impide que el proceso termine en entornos serverless/tests.
  setInterval(runAnchor, intervalMs).unref();
}

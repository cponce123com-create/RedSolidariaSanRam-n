import { Router, type IRouter } from "express";
import { db, campaignMovementsTable } from "@workspace/db";
import { asc, eq, sql } from "drizzle-orm";
import { toIsoSafe } from "../lib/date-format";
import { verifyChain } from "../lib/ledger";

const router: IRouter = Router();

// GET /campaigns/:id/movements — público: ledger hash-chained de la campaña.
// Paginado (?limit= máx 200, ?offset=); el total va en X-Total-Count.
// Se devuelve en orden de cadena (id ASC) para permitir verificación manual.
router.get("/campaigns/:id/movements", async (req, res) => {
  try {
    const campaignId = Number(req.params.id);
    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 50, 1), 200);
    const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);

    const [countRow] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(campaignMovementsTable)
      .where(eq(campaignMovementsTable.campaignId, campaignId));
    res.setHeader("X-Total-Count", String(countRow?.total ?? 0));

    const rows = await db
      .select()
      .from(campaignMovementsTable)
      .where(eq(campaignMovementsTable.campaignId, campaignId))
      .orderBy(asc(campaignMovementsTable.id))
      .limit(limit)
      .offset(offset);

    res.json(rows.map(formatMovement));
  } catch (err) {
    req.log.error({ err }, "Failed to get campaign movements");
    res.status(500).json({ error: "server_error", message: "Failed to get movements" });
  }
});

// GET /campaigns/:id/movements/verify — público: re-computa la cadena y
// detecta cualquier manipulación (brokenAt = id de la primera entrada rota).
router.get("/campaigns/:id/movements/verify", async (req, res) => {
  try {
    const campaignId = Number(req.params.id);
    const rows = await db
      .select()
      .from(campaignMovementsTable)
      .where(eq(campaignMovementsTable.campaignId, campaignId))
      .orderBy(asc(campaignMovementsTable.id));
    const result = verifyChain(rows);
    res.json({
      campaignId,
      verified: result.verified,
      brokenAt: result.brokenAt,
      rootHash: result.rootHash,
      count: result.count,
      verifiedAt: new Date().toISOString(),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to verify campaign movements");
    res.status(500).json({ error: "server_error", message: "Failed to verify movements" });
  }
});

// GET /ledger/root — público: raíz global de TODA la cadena (todas las
// campañas). Es el anclaje que un auditor externo puede contrastar con un
// anchor publicado (ver lib/anchor.ts).
router.get("/ledger/root", async (_req, res) => {
  try {
    const rows = await db
      .select()
      .from(campaignMovementsTable)
      .orderBy(asc(campaignMovementsTable.id));
    const result = verifyChain(rows);
    res.json({
      rootHash: result.rootHash,
      count: result.count,
      verified: result.verified,
      brokenAt: result.brokenAt,
      anchoredAt: new Date().toISOString(),
    });
  } catch (err) {
    _req.log.error({ err }, "Failed to get ledger root");
    res.status(500).json({ error: "server_error", message: "Failed to get ledger root" });
  }
});

function formatMovement(m: typeof campaignMovementsTable.$inferSelect) {
  return {
    id: m.id,
    campaignId: m.campaignId,
    kind: m.kind,
    amount: m.amount,
    description: m.description,
    sourceType: m.sourceType,
    sourceId: m.sourceId,
    prevHash: m.prevHash,
    hash: m.hash,
    createdAt: toIsoSafe(m.createdAt),
  };
}

export default router;

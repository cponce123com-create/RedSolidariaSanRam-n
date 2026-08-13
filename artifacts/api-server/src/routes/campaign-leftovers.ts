import { Router, type IRouter } from "express";
import { db, campaignLeftoversTable, insertCampaignLeftoverSchema } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { toIsoSafe } from "../lib/date-format";
import { requireAdmin } from "../middleware/require-admin";
import { requireRole, ROLES } from "../middleware/roles";

// Sobrantes de campaña: solo administrador o superadmin para escribir.
const adminOnly = [requireAdmin, requireRole(ROLES.ADMIN)];
import { adminActionLimiter } from "../middleware/rate-limit";

const router: IRouter = Router();

// Público: SOLO sobrantes publicados (is_public=true). El filtro va en SQL
// para que las filas privadas NUNCA salgan por este endpoint anónimo (mismo
// patrón que /campaigns/:id/evidence).
router.get("/campaigns/:id/leftovers", async (req, res) => {
  try {
    const campaignId = Number(req.params.id);
    const leftovers = await db
      .select()
      .from(campaignLeftoversTable)
      .where(
        and(
          eq(campaignLeftoversTable.campaignId, campaignId),
          eq(campaignLeftoversTable.isPublic, true),
        ),
      )
      .orderBy(desc(campaignLeftoversTable.createdAt));
    res.json(leftovers.map(formatLeftover));
  } catch (err) {
    req.log.error({ err }, "Failed to get campaign leftovers");
    res.status(500).json({ error: "server_error", message: "Failed to get leftovers" });
  }
});

// Admin: TODOS los sobrantes (públicos y privados) para gestión interna.
// Protegido por el gate global /admin/* (index.ts) y por adminOnly.
router.get(
  "/admin/campaigns/:id/leftovers",
  ...adminOnly,
  adminActionLimiter,
  async (req, res) => {
    try {
      const campaignId = Number(req.params.id);
      const leftovers = await db
        .select()
        .from(campaignLeftoversTable)
        .where(eq(campaignLeftoversTable.campaignId, campaignId))
        .orderBy(desc(campaignLeftoversTable.createdAt));
      res.json(leftovers.map(formatLeftover));
    } catch (err) {
      req.log.error({ err }, "Failed to get campaign leftovers (admin)");
      res.status(500).json({ error: "server_error", message: "Failed to get leftovers" });
    }
  },
);

router.post(
  "/campaigns/:id/leftovers",
  ...adminOnly,
  adminActionLimiter,
  async (req, res) => {
    try {
      const campaignId = Number(req.params.id);
      const data = insertCampaignLeftoverSchema.parse({ ...req.body, campaignId });
      const [leftover] = await db.insert(campaignLeftoversTable).values(data).returning();
      res.status(201).json(formatLeftover(leftover));
    } catch (err) {
      req.log.error({ err }, "Failed to create campaign leftover");
      res.status(400).json({ error: "validation_error", message: "Invalid leftover data" });
    }
  },
);

router.put(
  "/campaigns/:id/leftovers/:leftoverId",
  ...adminOnly,
  adminActionLimiter,
  async (req, res) => {
    try {
      const campaignId = Number(req.params.id);
      const leftoverId = Number(req.params.leftoverId);
      const data = insertCampaignLeftoverSchema.parse({ ...req.body, campaignId });
      const [leftover] = await db
        .update(campaignLeftoversTable)
        .set(data)
        .where(
          and(
            eq(campaignLeftoversTable.id, leftoverId),
            eq(campaignLeftoversTable.campaignId, campaignId),
          ),
        )
        .returning();
      if (!leftover) return res.status(404).json({ error: "not_found", message: "Leftover not found" });
      return res.json(formatLeftover(leftover));
    } catch (err) {
      req.log.error({ err }, "Failed to update campaign leftover");
      return res.status(400).json({ error: "validation_error", message: "Invalid leftover data" });
    }
  },
);

router.delete(
  "/campaigns/:id/leftovers/:leftoverId",
  ...adminOnly,
  adminActionLimiter,
  async (req, res) => {
    try {
      const campaignId = Number(req.params.id);
      const leftoverId = Number(req.params.leftoverId);
      await db
        .delete(campaignLeftoversTable)
        .where(
          and(
            eq(campaignLeftoversTable.id, leftoverId),
            eq(campaignLeftoversTable.campaignId, campaignId),
          ),
        );
      res.status(204).send();
    } catch (err) {
      req.log.error({ err }, "Failed to delete campaign leftover");
      res.status(500).json({ error: "server_error", message: "Failed to delete leftover" });
    }
  },
);

export function formatLeftover(e: typeof campaignLeftoversTable.$inferSelect) {
  return {
    id: e.id,
    campaignId: e.campaignId,
    item: e.item,
    quantity: e.quantity,
    unit: e.unit,
    notes: e.notes,
    isPublic: e.isPublic,
    createdAt: toIsoSafe(e.createdAt),
  };
}

export default router;

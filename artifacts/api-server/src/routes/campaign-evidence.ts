import { Router, type IRouter } from "express";
import { db, campaignEvidenceTable, insertCampaignEvidenceSchema } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { toIsoSafe } from "../lib/date-format";
import { requireAdmin } from "../middleware/require-admin";
import { requireRole, ROLES } from "../middleware/roles";

// Evidencias financieras: solo administrador o superadmin.
const adminOnly = [requireAdmin, requireRole(ROLES.ADMIN)];
import { adminActionLimiter } from "../middleware/rate-limit";

const router: IRouter = Router();

// Público: SOLO evidencias publicadas (is_public=true). El filtro va en SQL
// para que las filas privadas NUNCA salgan por este endpoint anónimo (antes
// devolvía TODAS las filas salvo ?publicOnly=true, exponiendo datos internos
// con caché pública). El panel admin usa GET /admin/campaigns/:id/evidence.
router.get("/campaigns/:id/evidence", async (req, res) => {
  try {
    const campaignId = Number(req.params.id);
    const evidence = await db
      .select()
      .from(campaignEvidenceTable)
      .where(
        and(
          eq(campaignEvidenceTable.campaignId, campaignId),
          eq(campaignEvidenceTable.isPublic, true),
        ),
      )
      .orderBy(desc(campaignEvidenceTable.createdAt));
    res.json(evidence.map(formatEvidence));
  } catch (err) {
    req.log.error({ err }, "Failed to get campaign evidence");
    res.status(500).json({ error: "server_error", message: "Failed to get evidence" });
  }
});

// Admin: TODAS las evidencias (públicas y privadas) para gestión interna.
// Protegido por el gate global /admin/* (index.ts) y por adminOnly.
router.get(
  "/admin/campaigns/:id/evidence",
  ...adminOnly,
  adminActionLimiter,
  async (req, res) => {
    try {
      const campaignId = Number(req.params.id);
      const evidence = await db
        .select()
        .from(campaignEvidenceTable)
        .where(eq(campaignEvidenceTable.campaignId, campaignId))
        .orderBy(desc(campaignEvidenceTable.createdAt));
      res.json(evidence.map(formatEvidence));
    } catch (err) {
      req.log.error({ err }, "Failed to get campaign evidence (admin)");
      res.status(500).json({ error: "server_error", message: "Failed to get evidence" });
    }
  },
);

router.post(
  "/campaigns/:id/evidence",
  ...adminOnly,
  adminActionLimiter,
  async (req, res) => {
    try {
      const campaignId = Number(req.params.id);
      const data = insertCampaignEvidenceSchema.parse({ ...req.body, campaignId });
      const [ev] = await db.insert(campaignEvidenceTable).values(data).returning();
      res.status(201).json(formatEvidence(ev));
    } catch (err) {
      req.log.error({ err }, "Failed to create campaign evidence");
      res.status(400).json({ error: "validation_error", message: "Invalid evidence data" });
    }
  },
);

router.put(
  "/campaigns/:id/evidence/:evidenceId",
  ...adminOnly,
  adminActionLimiter,
  async (req, res) => {
    try {
      const campaignId = Number(req.params.id);
      const evidenceId = Number(req.params.evidenceId);
      const data = insertCampaignEvidenceSchema.parse({ ...req.body, campaignId });
      const [ev] = await db
        .update(campaignEvidenceTable)
        .set(data)
        .where(and(eq(campaignEvidenceTable.id, evidenceId), eq(campaignEvidenceTable.campaignId, campaignId)))
        .returning();
      if (!ev) return res.status(404).json({ error: "not_found", message: "Evidence not found" });
      return res.json(formatEvidence(ev));
    } catch (err) {
      req.log.error({ err }, "Failed to update campaign evidence");
      return res.status(400).json({ error: "validation_error", message: "Invalid evidence data" });
    }
  },
);

router.delete(
  "/campaigns/:id/evidence/:evidenceId",
  ...adminOnly,
  adminActionLimiter,
  async (req, res) => {
    try {
      const campaignId = Number(req.params.id);
      const evidenceId = Number(req.params.evidenceId);
      await db
        .delete(campaignEvidenceTable)
        .where(and(eq(campaignEvidenceTable.id, evidenceId), eq(campaignEvidenceTable.campaignId, campaignId)));
      res.status(204).send();
    } catch (err) {
      req.log.error({ err }, "Failed to delete campaign evidence");
      res.status(500).json({ error: "server_error", message: "Failed to delete evidence" });
    }
  },
);

export function formatEvidence(e: typeof campaignEvidenceTable.$inferSelect) {
  return {
    id: e.id,
    campaignId: e.campaignId,
    title: e.title,
    description: e.description,
    mediaUrl: e.mediaUrl,
    mediaType: e.mediaType,
    evidenceType: e.evidenceType,
    date: e.date,
    isPublic: e.isPublic,
    createdAt: toIsoSafe(e.createdAt),
  };
}

export default router;

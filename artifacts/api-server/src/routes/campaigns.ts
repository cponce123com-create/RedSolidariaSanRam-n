import { Router, type IRouter } from "express";
import {
  db,
  campaignsTable,
  donationsTable,
  insertCampaignSchema,
} from "@workspace/db";
import { eq, and, sql, desc } from "drizzle-orm";
import { requireAdmin } from "../middleware/require-admin";
import { adminActionLimiter } from "../middleware/rate-limit";
import { toIsoSafe } from "../lib/date-format";
import { formatPublicDonor } from "../lib/donor-format";

const router: IRouter = Router();

// GET /campaigns — público, con filtros, paginación y agregación en una sola query
router.get("/campaigns", async (req, res) => {
  try {
    const { status, featured, limit: rawLimit, offset: rawOffset } = req.query;
    const limit = Math.min(Math.max(parseInt(rawLimit as string) || 50, 1), 100);
    const offset = Math.max(parseInt(rawOffset as string) || 0, 0);

    const conditions = [];
    if (status && status !== "all") {
      conditions.push(eq(campaignsTable.status, status as string));
    }
    if (featured !== undefined && featured !== "all") {
      conditions.push(eq(campaignsTable.featured, featured === "true"));
    }

    const rows = await db
      .select({
        campaign: campaignsTable,
        donorCount: sql<number>`count(${donationsTable.id}) filter (where ${donationsTable.status} = 'approved')::int`,
        raisedFromDonations: sql<number>`coalesce(sum(${donationsTable.amount}) filter (where ${donationsTable.status} = 'approved'), 0)`,
      })
      .from(campaignsTable)
      .leftJoin(donationsTable, eq(donationsTable.campaignId, campaignsTable.id))
      .where(conditions.length ? and(...conditions) : undefined)
      .groupBy(campaignsTable.id)
      .orderBy(desc(campaignsTable.createdAt))
      .limit(limit)
      .offset(offset);

    res.json(
      rows.map(({ campaign, donorCount, raisedFromDonations }) =>
        formatCampaign(campaign, donorCount, raisedFromDonations),
      ),
    );
  } catch (err) {
    req.log.error({ err }, "Failed to get campaigns");
    res.status(500).json({ error: "server_error", message: "Failed to get campaigns" });
  }
});

router.get("/campaigns/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [row] = await db
      .select({
        campaign: campaignsTable,
        donorCount: sql<number>`count(${donationsTable.id}) filter (where ${donationsTable.status} = 'approved')::int`,
        raisedFromDonations: sql<number>`coalesce(sum(${donationsTable.amount}) filter (where ${donationsTable.status} = 'approved'), 0)`,
      })
      .from(campaignsTable)
      .leftJoin(donationsTable, eq(donationsTable.campaignId, campaignsTable.id))
      .where(eq(campaignsTable.id, id))
      .groupBy(campaignsTable.id)
      .limit(1);

    if (!row) {
      return res.status(404).json({ error: "not_found", message: "Campaign not found" });
    }
    return res.json(
      formatCampaign(row.campaign, row.donorCount, row.raisedFromDonations),
    );
  } catch (err) {
    req.log.error({ err }, "Failed to get campaign");
    return res.status(500).json({ error: "server_error", message: "Failed to get campaign" });
  }
});

// GET /campaigns/:id/donors — público: donantes aprobados de la campaña.
// Nunca expone email/phone; el nombre se omite si la donación es anónima y
// el comprobante solo se muestra si el donante autorizó (publicProof).
// Paginado: ?limit= (default 50, máx 200) & ?offset= ; el total va en X-Total-Count.
router.get("/campaigns/:id/donors", async (req, res) => {
  try {
    const campaignId = Number(req.params.id);
    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 50, 1), 200);
    const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);

    const approved = and(
      eq(donationsTable.campaignId, campaignId),
      eq(donationsTable.status, "approved"),
    );

    // count(*)::int → pg devuelve int4 como number (count nativo viene como string)
    const [countRow] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(donationsTable)
      .where(approved);
    res.setHeader("X-Total-Count", String(countRow?.total ?? 0));

    const donors = await db
      .select({
        id: donationsTable.id,
        firstName: donationsTable.firstName,
        lastName: donationsTable.lastName,
        amount: donationsTable.amount,
        message: donationsTable.message,
        anonymous: donationsTable.anonymous,
        publicProof: donationsTable.publicProof,
        receiptUrl: donationsTable.receiptUrl,
        createdAt: donationsTable.createdAt,
      })
      .from(donationsTable)
      .where(approved)
      .orderBy(desc(donationsTable.createdAt))
      .limit(limit)
      .offset(offset);

    res.json(
      donors.map((d) => ({
        id: d.id,
        name: d.anonymous ? null : `${d.firstName} ${d.lastName}`.trim(),
        amount: d.amount,
        message: d.message,
        date: toIsoSafe(d.createdAt),
        publicProof: d.publicProof,
        proofUrl: d.publicProof ? d.receiptUrl : null,
      })),
    );
  } catch (err) {
    req.log.error({ err }, "Failed to get campaign donors");
    res.status(500).json({ error: "server_error", message: "Failed to get campaign donors" });
  }
});

router.post("/campaigns", requireAdmin, adminActionLimiter, async (req, res) => {
  try {
    const data = insertCampaignSchema.parse(req.body);
    const [campaign] = await db.insert(campaignsTable).values(data).returning();
    res.status(201).json(formatCampaign(campaign, 0, 0));
  } catch (err) {
    req.log.error({ err }, "Failed to create campaign");
    res.status(400).json({ error: "validation_error", message: "Invalid campaign data" });
  }
});

router.put("/campaigns/:id", requireAdmin, adminActionLimiter, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const data = insertCampaignSchema.parse(req.body);
    const [campaign] = await db
      .update(campaignsTable)
      .set(data)
      .where(eq(campaignsTable.id, id))
      .returning();
    if (!campaign) {
      return res.status(404).json({ error: "not_found", message: "Campaign not found" });
    }
    return res.json(formatCampaign(campaign, 0, 0));
  } catch (err) {
    req.log.error({ err }, "Failed to update campaign");
    return res.status(400).json({ error: "validation_error", message: "Invalid campaign data" });
  }
});

router.delete("/campaigns/:id", requireAdmin, adminActionLimiter, async (req, res) => {
  try {
    const id = Number(req.params.id);
    await db.delete(campaignsTable).where(eq(campaignsTable.id, id));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete campaign");
    res.status(500).json({ error: "server_error", message: "Failed to delete campaign" });
  }
});

function formatCampaign(
  c: typeof campaignsTable.$inferSelect,
  donorCount: number,
  raisedFromDonations: number,
) {
  // El monto recaudado proviene de las donaciones aprobadas (fuente de verdad);
  // la columna raised solo se usa como respaldo durante el seed.
  const raised = Math.max(c.raised, raisedFromDonations);

  return {
    id: c.id,
    title: c.title,
    description: c.description,
    imageUrl: c.imageUrl,
    goal: c.goal,
    raised,
    donorCount,
    status: c.status,
    featured: c.featured,
    category: c.category,
    startDate: c.startDate,
    endDate: c.endDate,
    latitude: c.latitude,
    longitude: c.longitude,
    createdAt: toIsoSafe(c.createdAt),
  };
}

export default router;

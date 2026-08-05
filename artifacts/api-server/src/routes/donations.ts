import { Router, type IRouter } from "express";
import {
  db,
  donationsTable,
  campaignsTable,
  insertDonationSchema,
} from "@workspace/db";
import { eq, and, sql, desc } from "drizzle-orm";
import { requireAdmin } from "../middleware/require-admin";
import { adminActionLimiter, donationLimiter } from "../middleware/rate-limit";

const router: IRouter = Router();

// POST /donations — público, con rate limit anti-spam
router.post("/donations", donationLimiter, async (req, res) => {
  try {
    const data = insertDonationSchema.parse({
      ...req.body,
      status: "pending",
    });
    const [donation] = await db.insert(donationsTable).values(data).returning();
    res.status(201).json(await formatDonation(donation));
  } catch (err) {
    req.log.error({ err }, "Failed to create donation");
    res.status(400).json({ error: "validation_error", message: "Invalid donation data" });
  }
});

// GET /donations/stats — público (solo agregados, sin datos personales)
router.get("/donations/stats", async (req, res) => {
  try {
    const [stats] = await db
      .select({
        totalDonations: sql<number>`count(*)`,
        totalAmount: sql<number>`coalesce(sum(${donationsTable.amount}) filter (where ${donationsTable.status} = 'approved'), 0)`,
        pendingCount: sql<number>`count(*) filter (where ${donationsTable.status} = 'pending')`,
        approvedCount: sql<number>`count(*) filter (where ${donationsTable.status} = 'approved')`,
        totalDonors: sql<number>`count(distinct ${donationsTable.email})`,
      })
      .from(donationsTable);
    res.json(stats);
  } catch (err) {
    req.log.error({ err }, "Failed to get donation stats");
    res.status(500).json({ error: "server_error", message: "Failed to get donation stats" });
  }
});

// GET /donations — solo admin (contiene datos personales de donantes)
router.get("/donations", requireAdmin, async (req, res) => {
  try {
    const { campaignId, status, limit: rawLimit, offset: rawOffset } = req.query;
    const limit = Math.min(Math.max(parseInt(rawLimit as string) || 100, 1), 500);
    const offset = Math.max(parseInt(rawOffset as string) || 0, 0);

    const conditions = [];
    if (campaignId) conditions.push(eq(donationsTable.campaignId, Number(campaignId)));
    if (status && status !== "all") conditions.push(eq(donationsTable.status, status as string));

    const rows = await db
      .select({
        donation: donationsTable,
        campaignTitle: campaignsTable.title,
      })
      .from(donationsTable)
      .leftJoin(campaignsTable, eq(donationsTable.campaignId, campaignsTable.id))
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(donationsTable.createdAt))
      .limit(limit)
      .offset(offset);

    res.json(
      rows.map(({ donation, campaignTitle }) =>
        formatDonation(donation, campaignTitle),
      ),
    );
  } catch (err) {
    req.log.error({ err }, "Failed to get donations");
    res.status(500).json({ error: "server_error", message: "Failed to get donations" });
  }
});

// GET /donations/:id — solo admin (datos personales)
router.get("/donations/:id", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [donation] = await db.select().from(donationsTable).where(eq(donationsTable.id, id));
    if (!donation) {
      return res.status(404).json({ error: "not_found", message: "Donation not found" });
    }
    return res.json(await formatDonation(donation));
  } catch (err) {
    req.log.error({ err }, "Failed to get donation");
    return res.status(500).json({ error: "server_error", message: "Failed to get donation" });
  }
});

// PUT /donations/:id — solo admin (aprobar/rechazar)
router.put("/donations/:id", requireAdmin, adminActionLimiter, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { status, adminNote } = req.body;
    if (!["pending", "approved", "rejected"].includes(status)) {
      return res.status(400).json({ error: "validation_error", message: "Invalid status" });
    }
    const [donation] = await db
      .update(donationsTable)
      .set({ status, adminNote: adminNote || null })
      .where(eq(donationsTable.id, id))
      .returning();
    if (!donation) {
      return res.status(404).json({ error: "not_found", message: "Donation not found" });
    }
    return res.json(await formatDonation(donation));
  } catch (err) {
    req.log.error({ err }, "Failed to update donation");
    return res.status(400).json({ error: "validation_error", message: "Invalid donation data" });
  }
});

// GET /campaigns/:id/donations — solo admin (datos personales)
router.get("/campaigns/:id/donations", requireAdmin, async (req, res) => {
  try {
    const campaignId = Number(req.params.id);
    const rows = await db
      .select({
        donation: donationsTable,
        campaignTitle: campaignsTable.title,
      })
      .from(donationsTable)
      .leftJoin(campaignsTable, eq(donationsTable.campaignId, campaignsTable.id))
      .where(eq(donationsTable.campaignId, campaignId))
      .orderBy(desc(donationsTable.createdAt));

    res.json(
      rows.map(({ donation, campaignTitle }) =>
        formatDonation(donation, campaignTitle),
      ),
    );
  } catch (err) {
    req.log.error({ err }, "Failed to get campaign donations");
    res.status(500).json({ error: "server_error", message: "Failed to get campaign donations" });
  }
});

async function formatDonation(
  d: typeof donationsTable.$inferSelect,
  campaignTitle: string | null = null,
) {
  if (campaignTitle === null && d.campaignId) {
    const [campaign] = await db
      .select({ title: campaignsTable.title })
      .from(campaignsTable)
      .where(eq(campaignsTable.id, d.campaignId));
    campaignTitle = campaign?.title ?? null;
  }
  return {
    id: d.id,
    campaignId: d.campaignId,
    campaignTitle,
    firstName: d.firstName,
    lastName: d.lastName,
    email: d.email,
    phone: d.phone,
    amount: d.amount,
    paymentMethod: d.paymentMethod,
    message: d.message,
    anonymous: d.anonymous,
    receiptUrl: d.receiptUrl,
    receiptNote: d.receiptNote,
    status: d.status,
    adminNote: d.adminNote,
    createdAt: d.createdAt.toISOString(),
  };
}

export default router;

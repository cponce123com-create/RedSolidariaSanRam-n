import { Router, type IRouter } from "express";
import { db, donationsTable, campaignsTable, insertDonationSchema } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";

const router: IRouter = Router();

router.post("/donations", async (req, res) => {
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

router.get("/donations/stats", async (req, res) => {
  try {
    const all = await db.select().from(donationsTable);
    const approved = all.filter((d) => d.status === "approved");
    const pending = all.filter((d) => d.status === "pending");
    const donors = new Set(all.map((d) => d.email)).size;
    res.json({
      totalDonations: all.length,
      totalAmount: approved.reduce((sum, d) => sum + d.amount, 0),
      pendingCount: pending.length,
      approvedCount: approved.length,
      totalDonors: donors,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get donation stats");
    res.status(500).json({ error: "server_error", message: "Failed to get donation stats" });
  }
});

router.get("/donations", async (req, res) => {
  try {
    const { campaignId, status } = req.query;
    let donations = await db.select().from(donationsTable);
    if (campaignId) {
      donations = donations.filter((d) => d.campaignId === Number(campaignId));
    }
    if (status && status !== "all") {
      donations = donations.filter((d) => d.status === status);
    }
    const result = await Promise.all(donations.map(formatDonation));
    res.json(result.reverse());
  } catch (err) {
    req.log.error({ err }, "Failed to get donations");
    res.status(500).json({ error: "server_error", message: "Failed to get donations" });
  }
});

router.get("/donations/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [donation] = await db.select().from(donationsTable).where(eq(donationsTable.id, id));
    if (!donation) {
      return res.status(404).json({ error: "not_found", message: "Donation not found" });
    }
    return res.json(await formatDonation(donation));
  } catch (err) {
    req.log.error({ err }, "Failed to get donation" );
    return res.status(500).json({ error: "server_error", message: "Failed to get donation" });
  }
});

router.put("/donations/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
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

router.get("/campaigns/:id/donations", async (req, res) => {
  try {
    const campaignId = parseInt(req.params.id);
    const donations = await db
      .select()
      .from(donationsTable)
      .where(eq(donationsTable.campaignId, campaignId));
    const result = await Promise.all(donations.map(formatDonation));
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Failed to get campaign donations");
    res.status(500).json({ error: "server_error", message: "Failed to get campaign donations" });
  }
});

async function formatDonation(d: typeof donationsTable.$inferSelect) {
  let campaignTitle: string | null = null;
  if (d.campaignId) {
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

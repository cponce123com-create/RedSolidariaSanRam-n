import { Router, type IRouter } from "express";
import {
  db,
  donationsTable,
  campaignsTable,
  donationProofsTable,
  insertDonationSchema,
} from "@workspace/db";
import { eq, and, sql, desc } from "drizzle-orm";
import { requireAdmin } from "../middleware/require-admin";
import { adminActionLimiter, donationLimiter } from "../middleware/rate-limit";
import { logAuditAction } from "../middleware/auth-utils";

const router: IRouter = Router();

// POST /donations — público, con rate limit anti-spam.
// El donante puede adjuntar el comprobante (captura de Yape/transferencia)
// subido previamente a Cloudinary.
router.post("/donations", donationLimiter, async (req, res) => {
  try {
    const data = insertDonationSchema.parse({
      ...req.body,
      status: "pending",
    });
    const [donation] = await db.insert(donationsTable).values(data).returning();

    const proofUrl =
      typeof req.body?.proofImageUrl === "string" ? req.body.proofImageUrl : null;
    if (proofUrl) {
      await db.insert(donationProofsTable).values({
        donationId: donation.id,
        imageUrl: proofUrl,
        publicId:
          typeof req.body?.proofPublicId === "string"
            ? req.body.proofPublicId
            : null,
        mimeType:
          typeof req.body?.proofMimeType === "string"
            ? req.body.proofMimeType
            : null,
      });
      // Mantener compatibilidad con el campo legacy de la donación
      await db
        .update(donationsTable)
        .set({ receiptUrl: proofUrl })
        .where(eq(donationsTable.id, donation.id));
    }

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

// PUT /donations/:id — solo admin (aprobar/rechazar) con audit log
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

    // Auditoría: quién aprobó/rechazó y con qué nota
    const admin = (req.session as any).adminUser;
    await logAuditAction({
      userId: admin?.id ?? null,
      username: admin?.username ?? null,
      action:
        status === "approved"
          ? "DONATION_APPROVED"
          : status === "rejected"
            ? "DONATION_REJECTED"
            : "DONATION_STATUS_CHANGED",
      resource: "donations",
      resourceId: String(id),
      ipAddress: req.ip || req.connection?.remoteAddress || null,
      userAgent: req.get("user-agent") || null,
      details: { status, adminNote: adminNote || null, amount: donation.amount },
    });

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

// GET /donations/:id/proofs — solo admin (comprobantes de una donación)
router.get("/donations/:id/proofs", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const proofs = await db
      .select()
      .from(donationProofsTable)
      .where(eq(donationProofsTable.donationId, id))
      .orderBy(desc(donationProofsTable.createdAt));
    res.json(proofs);
  } catch (err) {
    req.log.error({ err }, "Failed to get donation proofs");
    res.status(500).json({ error: "server_error", message: "Failed to get donation proofs" });
  }
});

// POST /donations/:id/proofs — solo admin (comprobante manual, p. ej. por WhatsApp)
router.post(
  "/donations/:id/proofs",
  requireAdmin,
  adminActionLimiter,
  async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { imageUrl, publicId, mimeType } = req.body ?? {};
      if (typeof imageUrl !== "string" || !imageUrl.trim()) {
        return res.status(400).json({ error: "validation_error", message: "imageUrl es requerido" });
      }
      const [donation] = await db
        .select()
        .from(donationsTable)
        .where(eq(donationsTable.id, id));
      if (!donation) {
        return res.status(404).json({ error: "not_found", message: "Donation not found" });
      }
      const [proof] = await db
        .insert(donationProofsTable)
        .values({
          donationId: id,
          imageUrl: imageUrl.trim(),
          publicId: typeof publicId === "string" ? publicId : null,
          mimeType: typeof mimeType === "string" ? mimeType : null,
        })
        .returning();
      if (!donation.receiptUrl) {
        await db
          .update(donationsTable)
          .set({ receiptUrl: imageUrl.trim() })
          .where(eq(donationsTable.id, id));
      }
      return res.status(201).json(proof);
    } catch (err) {
      req.log.error({ err }, "Failed to add donation proof");
      return res.status(400).json({ error: "validation_error", message: "Invalid proof data" });
    }
  },
);

// DELETE /donations/:id/proofs/:proofId — solo admin
router.delete(
  "/donations/:id/proofs/:proofId",
  requireAdmin,
  adminActionLimiter,
  async (req, res) => {
    try {
      const id = Number(req.params.id);
      const proofId = Number(req.params.proofId);
      await db
        .delete(donationProofsTable)
        .where(
          and(
            eq(donationProofsTable.id, proofId),
            eq(donationProofsTable.donationId, id),
          ),
        );
      return res.status(204).send();
    } catch (err) {
      req.log.error({ err }, "Failed to delete donation proof");
      return res.status(500).json({ error: "server_error", message: "Failed to delete proof" });
    }
  },
);

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
    publicProof: d.publicProof,
    receiptUrl: d.receiptUrl,
    receiptNote: d.receiptNote,
    status: d.status,
    adminNote: d.adminNote,
    createdAt: d.createdAt.toISOString(),
  };
}

export default router;


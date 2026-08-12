import { Router, type IRouter } from "express";
import { db, donationsTable, campaignsTable, donationProofsTable } from "@workspace/db";
import { eq, and, sql, desc } from "drizzle-orm";
import { requireAdmin } from "../middleware/require-admin";
import { requireRole, ROLES } from "../middleware/roles";
import { adminActionLimiter, donationLimiter } from "../middleware/rate-limit";

// Dinero: solo administrador o superadmin (los moderadores gestionan contenido).
const adminOnly = [requireAdmin, requireRole(ROLES.ADMIN)];
import { logAuditAction } from "../middleware/auth-utils";
import { appendMovement } from "../lib/ledger";
import { toSafeAmount } from "../lib/amount-format";
import {
  donationInputSchema,
  isAllowedTransition,
  approvalRequiresProof,
  isValidProofUrl,
} from "../lib/donation-validation";

// NOTA sobre la proyección de los listados admin:
// Se usa proyección por tabla (`donation: donationsTable`) + leftJoin, NO
// proyección plana por columna. En la versión de drizzle empaquetada en
// producción, la combinación "proyección plana + leftJoin" devuelve las filas
// con TODOS los campos undefined (fecha "—", donante vacío, amount 0 en el
// panel admin). La proyección por tabla + leftJoin es el patrón que funciona
// (endpoint público /campaigns); el monto de la columna money llega como
// string ("500.00") y formatDonation lo normaliza con toSafeAmount.

// Errores de negocio con mensaje claro para el panel admin (400 en vez del
// 400 genérico de validación).
class DonationTransitionError extends Error {
  constructor(from: string, to: string) {
    super(
      `No se puede cambiar la donación de ${from} a ${to}. Las donaciones aprobadas quedan registradas en el ledger de transparencia.`,
    );
    this.name = "DonationTransitionError";
  }
}
class DonationProofRequiredError extends Error {
  constructor() {
    super(
      "Se requiere un comprobante (captura de pago) para aprobar esta donación. Agrégala desde la ficha.",
    );
    this.name = "DonationProofRequiredError";
  }
}

const router: IRouter = Router();

// POST /donations — público, con rate limit anti-spam.
// El donante puede adjuntar el comprobante (captura de Yape/transferencia)
// subido previamente a Cloudinary.
router.post("/donations", donationLimiter, async (req, res) => {
  try {
    const data = donationInputSchema.parse(req.body);

    // Campaña destino: debe existir y estar activa (fondo general = null).
    if (data.campaignId != null) {
      const [campaign] = await db
        .select({ status: campaignsTable.status })
        .from(campaignsTable)
        .where(eq(campaignsTable.id, data.campaignId));
      if (!campaign) {
        return res
          .status(400)
          .json({ error: "validation_error", message: "La campaña no existe." });
      }
      if (campaign.status !== "active") {
        return res
          .status(400)
          .json({ error: "validation_error", message: "La campaña no está activa." });
      }
    }

    // Comprobante del donante: la URL debe ser https de Cloudinary (las
    // subidas usan firma del servidor, pero validamos aquí que el cliente no
    // cuelgue URLs arbitrarias) y el publicId debe venir con la subida.
    const proofUrl =
      typeof req.body?.proofImageUrl === "string" ? req.body.proofImageUrl : null;
    const proofPublicId =
      typeof req.body?.proofPublicId === "string" ? req.body.proofPublicId : null;
    if (
      proofUrl &&
      (!isValidProofUrl(proofUrl, { requireCloudinary: true }) || !proofPublicId)
    ) {
      return res.status(400).json({
        error: "validation_error",
        message: "Comprobante inválido. Vuelve a subir la captura.",
      });
    }

    // Valores explícitos: `status` lo fija el servidor (el cliente no puede
    // spoofearlo) y los booleanos sin valor caen a su default de la DB.
    const [donation] = await db
      .insert(donationsTable)
      .values({
        campaignId: data.campaignId ?? null,
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        phone: data.phone ?? null,
        amount: data.amount,
        paymentMethod: data.paymentMethod,
        message: data.message ?? null,
        anonymous: data.anonymous ?? false,
        publicProof: data.publicProof ?? false,
        receiptNote: data.receiptNote ?? null,
        status: "pending",
      })
      .returning();

    if (proofUrl) {
      await db.insert(donationProofsTable).values({
        donationId: donation.id,
        imageUrl: proofUrl,
        publicId: proofPublicId,
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

    return res.status(201).json(await formatDonation(donation));
  } catch (err) {
    req.log.error({ err }, "Failed to create donation");
    return res.status(400).json({ error: "validation_error", message: "Invalid donation data" });
  }
});

// GET /donations/stats — público (solo agregados, sin datos personales)
router.get("/donations/stats", async (req, res) => {
  try {
    // Casts ::int / ::float8: pg devuelve count como string y sum(numeric)
    // como string; el contrato DonationStats es number → normalizamos en SQL.
    const [stats] = await db
      .select({
        totalDonations: sql<number>`count(*)::int`,
        totalAmount: sql<number>`coalesce(sum(${donationsTable.amount}) filter (where ${donationsTable.status} = 'approved'), 0)::float8`,
        pendingCount: sql<number>`count(*) filter (where ${donationsTable.status} = 'pending')::int`,
        approvedCount: sql<number>`count(*) filter (where ${donationsTable.status} = 'approved')::int`,
        totalDonors: sql<number>`count(distinct ${donationsTable.email})::int`,
      })
      .from(donationsTable);
    res.json(stats);
  } catch (err) {
    req.log.error({ err }, "Failed to get donation stats");
    res.status(500).json({ error: "server_error", message: "Failed to get donation stats" });
  }
});

// GET /donations — solo admin (contiene datos personales de donantes)
router.get("/donations", ...adminOnly, async (req, res) => {
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
router.get("/donations/:id", ...adminOnly, async (req, res) => {
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

// PUT /donations/:id — solo admin (aprobar/rechazar) con audit log.
// Transaccional: aprobar una donación encadena el ingreso en el ledger Trust Pay.
router.put("/donations/:id", ...adminOnly, adminActionLimiter, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { status, adminNote } = req.body;
    if (!["pending", "approved", "rejected"].includes(status)) {
      return res.status(400).json({ error: "validation_error", message: "Invalid status" });
    }

    const donation = await db.transaction(async (tx) => {
      // Lock de la fila: evita doble aprobación concurrente (y doble entrada de ledger).
      const [existing] = await tx
        .select()
        .from(donationsTable)
        .where(eq(donationsTable.id, id))
        .for("update");
      if (!existing) return null;

      // Máquina de estados: desde approved no se puede volver (el ingreso ya
      // está encadenado en el ledger append-only → transparencia intacta).
      if (!isAllowedTransition(existing.status, status)) {
        throw new DonationTransitionError(existing.status, status);
      }

      // Comprobación: para métodos digitales, aprobar sin comprobante
      // permitiría certificar dinero no verificado.
      if (
        status === "approved" &&
        approvalRequiresProof(existing.paymentMethod) &&
        !existing.receiptUrl
      ) {
        throw new DonationProofRequiredError();
      }

      const [updated] = await tx
        .update(donationsTable)
        .set({ status, adminNote: adminNote || null })
        .where(eq(donationsTable.id, id))
        .returning();

      // Ledger Trust Pay: solo en la transición → approved (la unicidad
      // source_type+source_id del ledger protege contra duplicados).
      if (updated.campaignId != null && existing.status !== "approved" && status === "approved") {
        await appendMovement(tx, updated.campaignId, {
          kind: "ingreso",
          amount: toSafeAmount(updated.amount),
          description: updated.anonymous
            ? "Donación anónima"
            : `Donación de ${updated.firstName} ${updated.lastName}`.trim(),
          sourceType: "donation",
          sourceId: updated.id,
          createdAt: new Date(),
        });
      }
      return updated;
    });

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
    if (
      err instanceof DonationTransitionError ||
      err instanceof DonationProofRequiredError
    ) {
      return res
        .status(400)
        .json({ error: "validation_error", message: err.message });
    }
    return res.status(400).json({ error: "validation_error", message: "Invalid donation data" });
  }
});

// GET /campaigns/:id/donations — solo admin (datos personales)
router.get("/campaigns/:id/donations", ...adminOnly, async (req, res) => {
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
router.get("/donations/:id/proofs", ...adminOnly, async (req, res) => {
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
  ...adminOnly,
  adminActionLimiter,
  async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { imageUrl, publicId, mimeType } = req.body ?? {};
      if (typeof imageUrl !== "string" || !imageUrl.trim()) {
        return res.status(400).json({ error: "validation_error", message: "imageUrl es requerido" });
      }
      if (!isValidProofUrl(imageUrl)) {
        return res
          .status(400)
          .json({ error: "validation_error", message: "La URL del comprobante debe ser https válida" });
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
  ...adminOnly,
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
  // Defensivo: un timestamp corrupto en BD no debe tumbar la serialización.
  const createdAt =
    d.createdAt instanceof Date && !Number.isNaN(d.createdAt.getTime())
      ? d.createdAt.toISOString()
      : null;
  // Defensivo: un monto nulo/corrupto no debe romper el frontend (toLocaleString).
  // toSafeAmount acepta number Y string numérico: pg devuelve numeric como
  // string y, según la forma de la query/versión de drizzle, el mapper del
  // customType money puede o no haber convertido — un "50.00" NUNCA → 0.
  const amount = toSafeAmount(d.amount);
  return {
    id: d.id,
    campaignId: d.campaignId,
    campaignTitle,
    firstName: d.firstName,
    lastName: d.lastName,
    email: d.email,
    phone: d.phone,
    amount,
    paymentMethod: d.paymentMethod,
    message: d.message,
    anonymous: d.anonymous,
    publicProof: d.publicProof,
    receiptUrl: d.receiptUrl,
    receiptNote: d.receiptNote,
    status: d.status,
    adminNote: d.adminNote,
    createdAt,
  };
}

export default router;


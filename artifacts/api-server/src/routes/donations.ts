import { Router, type IRouter } from "express";
import {
  db,
  donationsTable,
  campaignsTable,
  donationProofsTable,
  donationConsentsTable,
  donorsTable,
} from "@workspace/db";
import { eq, and, sql, desc } from "drizzle-orm";
import {
  isDonorType,
  normalizeCollaborationType,
  normalizeEmail,
} from "../lib/donor-identity";
import { requireAdmin } from "../middleware/require-admin";
import { requireRole, ROLES } from "../middleware/roles";
import { adminActionLimiter, donationLimiter } from "../middleware/rate-limit";

// Dinero: solo administrador o superadmin (los moderadores gestionan contenido).
const adminOnly = [requireAdmin, requireRole(ROLES.ADMIN)];
import { logAuditAction } from "../middleware/auth-utils";
import { AUDIT_ACTIONS, AUDIT_RESOURCES, auditContext } from "../lib/audit";
import { appendMovement } from "../lib/ledger";
import { toSafeAmount } from "../lib/amount-format";
import { consentState, validateConsentDecision } from "../lib/donor-consent";
import {
  approvalRequiresProof,
  donationInputSchema,
  isAllowedTransition,
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
class DonationBusinessError extends Error {}

class DonationTransitionError extends DonationBusinessError {
  constructor(from: string, to: string) {
    super(
      `No se puede cambiar la donación de ${from} a ${to}. Las donaciones aprobadas quedan registradas en el ledger de transparencia.`,
    );
    this.name = "DonationTransitionError";
  }
}

// Hallazgo API-05: una donación digital (Yape/Plin/transferencia) no debe
// aprobarse sin comprobante; sin evidencia no consta que el dinero llegó.
class DonationProofRequiredError extends DonationBusinessError {
  constructor(method: string) {
    super(`Esta donación (${method}) requiere un comprobante antes de aprobarse.`);
    this.name = "DonationProofRequiredError";
  }
}

const router: IRouter = Router();

// POST /donations — público, con rate limit anti-spam.
// El donante puede adjuntar el comprobante (captura de Yape/transferencia)
// subido previamente a Cloudinary.
router.post("/donations", donationLimiter, async (req, res) => {
  // La validación se resuelve ANTES del try (patrón del resto del API): un dato
  // inválido es un 400 explícito y el catch queda reservado para fallos
  // inesperados, que responden 500 en lugar de disfrazarse de validación.
  const parsed = donationInputSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "validation_error", message: "Invalid donation data" });
  }

  try {
    const data = parsed.data;

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

    // Transaccional (hallazgo API-02): la donación, su comprobante y el campo
    // legacy receiptUrl se escriben juntos o no se escriben.
    // Valores explícitos: `status` lo fija el servidor (el cliente no puede
    // spoofearlo) y los booleanos sin valor caen a su default de la DB.
    const donation = await db.transaction(async (tx) => {
      // Perfil de donante (Fase 3): se vincula —o se crea— por correo
      // normalizado. El correo es obligatorio en el schema, así que siempre hay
      // identidad. "Anónimo" significa no mostrar el nombre en público, NO
      // ausencia de registro interno.
      const donorEmail = normalizeEmail(data.email);
      let donorId: number | null = null;
      if (donorEmail) {
        const [found] = await tx
          .select({ id: donorsTable.id })
          .from(donorsTable)
          .where(sql`lower(${donorsTable.email}) = ${donorEmail}`);
        if (found) {
          donorId = found.id;
          // Solo se actualiza el tipo si el donante lo declara explícitamente.
          if (isDonorType(data.donorType)) {
            await tx
              .update(donorsTable)
              .set({ type: data.donorType, updatedAt: new Date() })
              .where(eq(donorsTable.id, donorId));
          }
        } else {
          const [created] = await tx
            .insert(donorsTable)
            .values({
              type: isDonorType(data.donorType) ? data.donorType : "individual",
              name: `${data.firstName} ${data.lastName}`.trim(),
              email: data.email,
            })
            .onConflictDoNothing()
            .returning({ id: donorsTable.id });
          if (created) {
            donorId = created.id;
          } else {
            // Carrera con otra donación simultánea del mismo correo.
            const [again] = await tx
              .select({ id: donorsTable.id })
              .from(donorsTable)
              .where(sql`lower(${donorsTable.email}) = ${donorEmail}`);
            donorId = again?.id ?? null;
          }
        }
      }

      const [row] = await tx
        .insert(donationsTable)
        .values({
          campaignId: data.campaignId ?? null,
          donorId,
          firstName: data.firstName,
          lastName: data.lastName,
          email: data.email,
          phone: data.phone ?? null,
          amount: data.amount,
          // Una donación en especie no tiene método de pago; "other" es la
          // convención ya usada por las donaciones históricas en especie
          // (ver src/lib/chocofest-2025-data.ts).
          paymentMethod: data.paymentMethod ?? "other",
          collaborationType: normalizeCollaborationType(data.collaborationType),
          message: data.message ?? null,
          anonymous: data.anonymous ?? false,
          publicProof: data.publicProof ?? false,
          receiptNote: data.receiptNote ?? null,
          status: "pending",
        })
        .returning();

      if (proofUrl) {
        await tx.insert(donationProofsTable).values({
          donationId: row.id,
          imageUrl: proofUrl,
          publicId: proofPublicId,
          mimeType:
            typeof req.body?.proofMimeType === "string"
              ? req.body.proofMimeType
              : null,
        });
        // Mantener compatibilidad con el campo legacy de la donación
        await tx
          .update(donationsTable)
          .set({ receiptUrl: proofUrl })
          .where(eq(donationsTable.id, row.id));
      }

      return row;
    });

    return res.status(201).json(await formatDonation(donation));
  } catch (err) {
    // API-06: un fallo inesperado (base de datos caída, error de programación)
    // NO es un error de validación del cliente. Devolver 400 aquí hacía que la
    // interfaz dijera «datos inválidos» y que nadie viera una señal de 500.
    req.log.error({ err }, "Failed to create donation");
    return res.status(500).json({
      error: "server_error",
      message: "No se pudo registrar la donación. Intenta nuevamente.",
    });
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
        totalAmount: sql<number>`coalesce(sum(${donationsTable.amount}) filter (where ${donationsTable.status} in ('approved','reconciled')), 0)::float8`,
        pendingCount: sql<number>`count(*) filter (where ${donationsTable.status} = 'pending')::int`,
        approvedCount: sql<number>`count(*) filter (where ${donationsTable.status} in ('approved','reconciled'))::int`,
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
// SQL crudo con db.execute (patrón probado en dashboard/stats): el mapeo de
// filas de drizzle con leftJoin está roto en el bundle desplegado (todas las
// columnas volvían undefined → panel admin con fechas "—", donante vacío y
// montos S/ 0). pg devuelve los valores directos; el mapeo es manual y
// determinista, con casts ::float8 para el monto.
router.get("/donations", ...adminOnly, async (req, res) => {
  try {
    const { campaignId, status, limit: rawLimit, offset: rawOffset } = req.query;
    const limit = Math.min(Math.max(parseInt(rawLimit as string) || 100, 1), 500);
    const offset = Math.max(parseInt(rawOffset as string) || 0, 0);

    const whereParts: ReturnType<typeof sql>[] = [];
    if (campaignId) whereParts.push(sql`d.campaign_id = ${Number(campaignId)}`);
    if (status && status !== "all") whereParts.push(sql`d.status = ${status}`);
    const whereClause = whereParts.length
      ? sql`WHERE ${sql.join(whereParts, sql.raw(" AND "))}`
      : sql``;

    const result = await db.execute(sql`
      SELECT
        d.id,
        d.campaign_id,
        d.first_name,
        d.last_name,
        d.email,
        d.phone,
        COALESCE(d.amount::float8, 0) AS amount,
        d.payment_method,
        d.message,
        d.anonymous,
        d.public_proof,
        d.receipt_url,
        d.receipt_note,
        d.status,
        d.collaboration_type,
        d.admin_note,
        d.created_at,
        c.title AS campaign_title
      FROM donations d
      LEFT JOIN campaigns c ON c.id = d.campaign_id
      ${whereClause}
      ORDER BY d.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `);

    res.json(
      (result.rows as Record<string, unknown>[]).map((r) =>
        formatDonationRow(r),
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

      // Hallazgo API-05: no aprobar una donación digital sin comprobante. Una
      // donación en especie nunca exige comprobante.
      if (
        status === "approved" &&
        existing.status !== "approved" &&
        approvalRequiresProof(existing.paymentMethod, existing.collaborationType)
      ) {
        const [proof] = await tx
          .select({ id: donationProofsTable.id })
          .from(donationProofsTable)
          .where(eq(donationProofsTable.donationId, id))
          .limit(1);
        if (!proof && !existing.receiptUrl) {
          throw new DonationProofRequiredError(existing.paymentMethod);
        }
      }

      const [updated] = await tx
        .update(donationsTable)
        .set({ status, adminNote: adminNote || null })
        .where(eq(donationsTable.id, id))
        .returning();

      // Ledger Trust Pay: solo en la transición → approved (la unicidad
      // source_type+source_id del ledger protege contra duplicados).
      // Una donación en especie con valor estimado 0 no aporta nada al libro y
      // el libro es append-only: un movimiento de 0 sería ruido permanente.
      if (
        updated.campaignId != null &&
        existing.status !== "approved" &&
        status === "approved" &&
        toSafeAmount(updated.amount) > 0
      ) {
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
    const admin = req.session.adminUser;
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
    if (err instanceof DonationBusinessError) {
      return res
        .status(400)
        .json({ error: "validation_error", message: err.message });
    }
    return res.status(400).json({ error: "validation_error", message: "Invalid donation data" });
  }
});

// GET /campaigns/:id/donations — solo admin (datos personales)
// Mismo patrón SQL crudo que el listado general (mapeo de drizzle con
// leftJoin roto en el bundle desplegado).
router.get("/campaigns/:id/donations", ...adminOnly, async (req, res) => {
  try {
    const campaignId = Number(req.params.id);
    const result = await db.execute(sql`
      SELECT
        d.id,
        d.campaign_id,
        d.first_name,
        d.last_name,
        d.email,
        d.phone,
        COALESCE(d.amount::float8, 0) AS amount,
        d.payment_method,
        d.message,
        d.anonymous,
        d.public_proof,
        d.receipt_url,
        d.receipt_note,
        d.status,
        d.collaboration_type,
        d.admin_note,
        d.created_at,
        c.title AS campaign_title
      FROM donations d
      LEFT JOIN campaigns c ON c.id = d.campaign_id
      WHERE d.campaign_id = ${campaignId}
      ORDER BY d.created_at DESC
    `);

    res.json(
      (result.rows as Record<string, unknown>[]).map((r) =>
        formatDonationRow(r),
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
    collaborationType: d.collaborationType,
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

/**
 * Mapea una fila cruda de pg (SQL explícito, columnas snake_case) al contrato
 * Donation. No depende del mapper de drizzle: el monto viene con cast
 * ::float8 (number real) y la fecha como Date/string; toSafeAmount y el check
 * de fecha cubren cualquier valor corrupto.
 */
function formatDonationRow(r: Record<string, unknown>) {
  const createdAtRaw = r.created_at;
  const createdAt =
    createdAtRaw instanceof Date && !Number.isNaN(createdAtRaw.getTime())
      ? createdAtRaw.toISOString()
      : typeof createdAtRaw === "string" && !Number.isNaN(new Date(createdAtRaw).getTime())
        ? new Date(createdAtRaw).toISOString()
        : null;
  return {
    id: r.id,
    campaignId: r.campaign_id ?? null,
    campaignTitle: r.campaign_title ?? null,
    firstName: r.first_name ?? "",
    lastName: r.last_name ?? "",
    email: r.email ?? "",
    phone: r.phone ?? null,
    amount: toSafeAmount(r.amount),
    paymentMethod: r.payment_method ?? "",
    collaborationType: r.collaboration_type ?? "dinero",
    message: r.message ?? null,
    anonymous: r.anonymous ?? false,
    publicProof: r.public_proof ?? false,
    receiptUrl: r.receipt_url ?? null,
    receiptNote: r.receipt_note ?? null,
    status: r.status ?? "pending",
    adminNote: r.admin_note ?? null,
    createdAt,
  };
}

// ─── Consentimientos del donante (Fase 4 · V7.1) ─────────────────────────────
//
// El consentimiento para el reconocimiento público (nombre, comprobante,
// fotografías) se registra como DECISIONES append-only: nunca se sobrescribe
// nada, así que revocar no destruye historial. Son datos PRIVADOS: solo el panel
// administrativo (administrador/superadmin) los consulta y los registra.

// GET /donations/:id/consents — estado vigente + historial completo.
router.get("/donations/:id/consents", ...adminOnly, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "validation_error", message: "Identificador inválido" });
  }
  try {
    const [donation] = await db
      .select({ id: donationsTable.id, donorId: donationsTable.donorId })
      .from(donationsTable)
      .where(eq(donationsTable.id, id));
    if (!donation) {
      return res.status(404).json({ error: "not_found", message: "Donación no encontrada" });
    }

    const rows = await db
      .select({
        scope: donationConsentsTable.scope,
        granted: donationConsentsTable.granted,
        version: donationConsentsTable.version,
        reason: donationConsentsTable.reason,
        recordedBy: donationConsentsTable.recordedBy,
        createdAt: donationConsentsTable.createdAt,
      })
      .from(donationConsentsTable)
      .where(eq(donationConsentsTable.donationId, id))
      .orderBy(donationConsentsTable.createdAt, donationConsentsTable.id);

    res.setHeader("Cache-Control", "private, no-store");
    return res.json({
      donationId: id,
      donorId: donation.donorId ?? null,
      current: consentState(rows),
      history: rows.map((r) => ({
        scope: r.scope,
        granted: r.granted,
        version: r.version,
        reason: r.reason ?? null,
        recordedBy: r.recordedBy ?? null,
        at: r.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to read donation consents");
    return res.status(500).json({ error: "server_error", message: "No se pudieron leer los consentimientos" });
  }
});

// POST /donations/:id/consents — registra una DECISIÓN (otorgar o revocar).
// Revocar exige motivo; la operación queda auditada con quién y cuándo.
router.post("/donations/:id/consents", ...adminOnly, adminActionLimiter, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "validation_error", message: "Identificador inválido" });
  }
  const check = validateConsentDecision(req.body ?? {});
  if (!check.ok) {
    return res.status(400).json({ error: "validation_error", message: check.message });
  }
  try {
    const [donation] = await db
      .select({ id: donationsTable.id, donorId: donationsTable.donorId })
      .from(donationsTable)
      .where(eq(donationsTable.id, id));
    if (!donation) {
      return res.status(404).json({ error: "not_found", message: "Donación no encontrada" });
    }

    const [row] = await db
      .insert(donationConsentsTable)
      .values({
        donationId: id,
        donorId: donation.donorId ?? null,
        scope: check.scope,
        granted: check.granted,
        version: check.version,
        reason: check.reason,
        recordedBy: req.session?.adminUser?.username ?? null,
      })
      .returning();

    await logAuditAction({
      ...auditContext(req),
      action: AUDIT_ACTIONS.donationConsentRecorded,
      resource: AUDIT_RESOURCES.donations,
      resourceId: String(id),
      details: {
        scope: check.scope,
        granted: check.granted,
        version: check.version,
        reason: check.reason,
      },
    });

    return res.status(201).json({
      id: row.id,
      donationId: id,
      scope: row.scope,
      granted: row.granted,
      version: row.version,
      reason: row.reason ?? null,
      recordedBy: row.recordedBy ?? null,
      at: row.createdAt.toISOString(),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to record donation consent");
    return res.status(500).json({ error: "server_error", message: "No se pudo registrar el consentimiento" });
  }
});

export default router;


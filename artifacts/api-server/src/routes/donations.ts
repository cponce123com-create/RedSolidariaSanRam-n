import { Router, type IRouter } from "express";
import {
  db,
  donationsTable,
  campaignsTable,
  campaignMovementsTable,
  donationProofsTable,
  donationConsentsTable,
  donationItemsTable,
  donorsTable,
} from "@workspace/db";
import { eq, and, sql, desc } from "drizzle-orm";
import {
  ANNULLED_DONATION_STATUS,
  annulBlockReason,
  annulReversalDescription,
  isAnnulledDonation,
  isDonorType,
  normalizeCollaborationType,
  normalizeEmail,
} from "../lib/donor-identity";
import {
  analyzeAnnulment,
  planCampaignAnnulment,
  validateAnnulmentRequest,
  type AnnulmentDonation,
} from "../lib/donation-annulment";
import { requireAdmin } from "../middleware/require-admin";
import { requireRole, ROLES } from "../middleware/roles";
import {
  adminActionLimiter,
  donationLimiter,
  reauthLimiter,
} from "../middleware/rate-limit";

// Dinero: solo administrador o superadmin (los moderadores gestionan contenido).
const adminOnly = [requireAdmin, requireRole(ROLES.ADMIN)];

// ANULACIÓN CONTABLE: irreversible sobre las cifras, así que es exclusiva del
// superadmin y exige reautenticación (contraseña + 2FA si procede).
const superadminOnly = [requireAdmin, requireRole(ROLES.SUPERADMIN)];
import { logAuditAction } from "../middleware/auth-utils";
import { verifySuperadminReauth } from "../lib/admin-reauth";
import { AUDIT_ACTIONS, AUDIT_RESOURCES, auditContext } from "../lib/audit";
import {
  DONATION_REVERSAL_SOURCE,
  appendMovement,
  verifyLedger,
} from "../lib/ledger";
import { toSafeAmount } from "../lib/amount-format";
import { consentState, validateConsentDecision } from "../lib/donor-consent";
import {
  approvalRequiresProof,
  donationInputSchema,
  isAllowedTransition,
  isValidProofUrl,
} from "../lib/donation-validation";
import {
  fulfillmentBlockReason,
  fulfillmentLabel,
  normalizeFulfillmentStatus,
} from "../lib/donation-fulfillment";
import { normalizeDonationItems } from "../lib/donation-items";
import {
  generateTrackingCode,
  normalizeDedupeToken,
  normalizePePhone,
} from "../lib/donation-tracking";

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

import { closedCampaignError, isCampaignClosed } from "./campaign-closure";

/**
 * PENDIENTE (V14-2.3): bloquear la anulación EN BLOQUE de una campaña con cierre
 * financiero firmado. Mismo motivo que en la purga DEMO: un guarda pre-registrado se
 * ejecuta antes de la validación de la ruta y rompe el contrato «400 sin tocar la
 * base» que fijan las pruebas. Va dentro del manejador, tras validar y antes de la
 * transacción.
 *
 * La anulación INDIVIDUAL sí está bloqueada más abajo (resuelve la campaña desde la
 * donación, después de la reautenticación).
 */

// POST /donations — registro solo desde el panel admin. Los aportes públicos
// se coordinan por WhatsApp; el equipo registra y revisa cada ingreso.
router.post("/donations", ...adminOnly, donationLimiter, async (req, res) => {
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

    // ── Ítems de la donación en especie (V20 · Fase 2) ───────────────────────
    const collaborationType = normalizeCollaborationType(data.collaborationType);
    let items: {
      product: string;
      quantity: number;
      unit: string;
      description: string | null;
      estimatedValue: number;
    }[] = [];
    if (collaborationType === "productos") {
      const normalized = normalizeDonationItems(data.items);
      if (!normalized.ok) {
        return res.status(400).json({ error: "validation_error", message: normalized.message });
      }
      items = normalized.items;
    } else if (collaborationType === "servicios" || collaborationType === "logistica") {
      // Un servicio o apoyo logístico se DESCRIBE: sin descripción no hay nada
      // que coordinar con el donante.
      if (!data.message || data.message.trim().length < 10) {
        return res.status(400).json({
          error: "validation_error",
          message: "Describe brevemente tu colaboración (al menos 10 caracteres).",
        });
      }
    }

    // El DINERO es lo único que lleva importe. Un aporte en especie guarda su
    // valor —si lo declara— en cada ítem; si aquí se colara un `amount` en una
    // donación de productos, al aprobarla inflaría el total recaudado.
    const moneyAmount = collaborationType === "dinero" ? data.amount : 0;

    // ── Idempotencia (V20 · Fase 3) ──────────────────────────────────────────
    // Si el navegador reintenta el mismo envío (doble clic, red que se corta), se
    // devuelve la donación YA creada en lugar de registrar una segunda.
    const dedupeToken = normalizeDedupeToken(data.dedupeToken);
    if (dedupeToken) {
      const [existing] = await db
        .select()
        .from(donationsTable)
        .where(eq(donationsTable.dedupeToken, dedupeToken));
      if (existing) {
        return res.status(200).json(await formatDonation(existing));
      }
    }

    // WhatsApp normalizado a +51XXXXXXXXX (zod ya garantizó el formato).
    const phone = data.phone && data.phone.trim() ? normalizePePhone(data.phone) : null;
    // Código único de seguimiento que verá el donante.
    const trackingCode = generateTrackingCode();

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

    // Se devuelve la donación con sus ítems y el CÓDIGO DE SEGUIMIENTO que verá
    // el donante en la pantalla de agradecimiento.
    return res.status(201).json(await formatDonation(donation, null, items));
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
        totalDonations: sql<number>`count(*) filter (where status in ('approved','reconciled'))::int`,
        // El total es DINERO: se exige además `collaboration_type = 'dinero'`.
        // Así un importe colado en una donación en especie (histórica o futura)
        // jamás puede inflar el recaudado: bienes y dinero no se mezclan.
        totalAmount: sql<number>`coalesce(sum(${donationsTable.amount}) filter (where ${donationsTable.status} in ('approved','reconciled') and ${donationsTable.collaborationType} = 'dinero'), 0)::float8`,
        pendingCount: req.session?.adminUser ? sql<number>`count(*) filter (where ${donationsTable.status} = 'pending')::int` : sql<number>`0::int`,
        approvedCount: sql<number>`count(*) filter (where ${donationsTable.status} in ('approved','reconciled'))::int`,
        totalDonors: sql<number>`count(distinct ${donationsTable.email}) filter (where ${donationsTable.status} in ('approved','reconciled'))::int`,
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
        d.voided_at,
        d.voided_by,
        d.void_reason,
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

// ─── Anulación contable de donaciones (V7.2.2) ───────────────────────────────
//
// Una donación confirmada queda encadenada en el libro y la máquina de estados
// prohíbe volver atrás (`PUT /donations/:id` solo acepta pending/approved/rejected).
// Para corregir un dato de prueba o un registro erróneo se ANULA, nunca se borra:
// borrarla dejaría su asiento huérfano y rompería la cadena. Ver el porqué
// completo en `lib/donation-annulment.ts`.
//
//   · la donación pasa a `status = 'annulled'` → sale de TODAS las cifras;
//   · se añade un ASIENTO COMPENSATORIO (`gasto`, mismo importe, origen
//     `donation_reversal`) → el saldo del libro sigue cuadrando;
//   · el motivo, quién y cuándo quedan en la donación y en la auditoría.
//
// Es exclusivo del superadmin y exige reautenticación: cambia cifras publicadas.

type DbExecutor = Parameters<Parameters<typeof db.transaction>[0]>[0];

function toAnnulmentDonation(row: typeof donationsTable.$inferSelect): AnnulmentDonation {
  return {
    id: row.id,
    campaignId: row.campaignId,
    firstName: row.firstName,
    lastName: row.lastName,
    email: row.email,
    amount: toSafeAmount(row.amount),
    status: row.status,
    reconciledAt: row.reconciledAt ? row.reconciledAt.toISOString() : null,
  };
}

/** Asiento de INGRESO original de una donación (si existe). */
async function findDonationIncome(
  exec: DbExecutor,
  donationId: number,
): Promise<{ id: number; campaignId: number; amount: number | string } | null> {
  const [movement] = await exec
    .select({
      id: campaignMovementsTable.id,
      campaignId: campaignMovementsTable.campaignId,
      amount: campaignMovementsTable.amount,
    })
    .from(campaignMovementsTable)
    .where(
      and(
        eq(campaignMovementsTable.sourceType, "donation"),
        eq(campaignMovementsTable.sourceId, donationId),
      ),
    )
    .limit(1);
  return movement ?? null;
}

/**
 * Anula una donación DENTRO de la transacción: añade el asiento compensatorio
 * (si tenía ingreso encadenado) y la marca como anulada con su traza. Devuelve
 * la donación actualizada y el asiento compensatorio añadido, si lo hubo.
 *
 * El asiento se enlaza a la campaña del ASIENTO original, no a la campaña
 * actual de la donación: así el reverso cae en la misma cadena que el ingreso y
 * el saldo cuadra aunque el vínculo se hubiera cambiado después de aprobarla.
 */
async function annulWithin(
  tx: DbExecutor,
  donation: typeof donationsTable.$inferSelect,
  income: { id: number; campaignId: number; amount: number | string } | null,
  reason: string,
  actor: string | null,
): Promise<{ donation: typeof donationsTable.$inferSelect; reversalId: number | null }> {
  let reversalId: number | null = null;

  if (income) {
    await appendMovement(tx, income.campaignId, {
      kind: "gasto",
      amount: toSafeAmount(income.amount),
      description: annulReversalDescription(donation.id, reason),
      sourceType: DONATION_REVERSAL_SOURCE,
      sourceId: donation.id,
      createdAt: new Date(),
    });
    const [inserted] = await tx
      .select({ id: campaignMovementsTable.id })
      .from(campaignMovementsTable)
      .where(
        and(
          eq(campaignMovementsTable.sourceType, DONATION_REVERSAL_SOURCE),
          eq(campaignMovementsTable.sourceId, donation.id),
        ),
      )
      .limit(1);
    reversalId = inserted?.id ?? null;
  }

  const [updated] = await tx
    .update(donationsTable)
    .set({
      status: ANNULLED_DONATION_STATUS,
      voidedAt: new Date(),
      voidedBy: actor,
      voidReason: reason,
    })
    .where(eq(donationsTable.id, donation.id))
    .returning();

  return { donation: updated, reversalId };
}

/**
 * POST /donations/:id/void — ANULA contablemente una donación confirmada.
 * Exclusivo del superadmin, con reautenticación y motivo obligatorio.
 */
router.post(
  "/donations/:id/void",
  ...superadminOnly,
  reauthLimiter,
  adminActionLimiter,
  async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: "validation_error", message: "Identificador inválido" });
    }
    const parsed = validateAnnulmentRequest(req.body);
    if (!parsed.ok) {
      return res.status(400).json({ error: "validation_error", code: parsed.code, message: parsed.message });
    }

    const sessionUser = req.session?.adminUser ?? null;
    const reauth = await verifySuperadminReauth({
      userId: sessionUser?.id ?? null,
      username: sessionUser?.username ?? null,
      password: parsed.value.password,
      totpCode: parsed.value.totpCode,
    });
    if (!reauth.ok) {
      await logAuditAction({
        ...auditContext(req),
        action: AUDIT_ACTIONS.adminReauthFailed,
        resource: AUDIT_RESOURCES.donations,
        resourceId: String(id),
        details: { operation: "donation_void", code: reauth.code },
      });
      return res.status(401).json({ error: "unauthorized", code: reauth.code, message: reauth.message });
    }

    // V14-2.3: la contabilidad de una campaña con CIERRE FINANCIERO FIRMADO no se
    // toca. Este path no trae la campaña, así que se resuelve desde la donación.
    const [target] = await db
      .select({ campaignId: donationsTable.campaignId })
      .from(donationsTable)
      .where(eq(donationsTable.id, id));
    if (target?.campaignId && (await isCampaignClosed(target.campaignId))) {
      return res.status(409).json(closedCampaignError());
    }

    try {
      const outcome = await db.transaction(async (tx) => {
        // Lock de la donación (mismo orden que PUT /donations/:id: donación →
        // campaña) para que dos anulaciones concurrentes no dupliquen el reverso.
        const [existing] = await tx
          .select()
          .from(donationsTable)
          .where(eq(donationsTable.id, id))
          .for("update");
        if (!existing) return { kind: "not_found" as const };
        if (isAnnulledDonation(existing.status)) {
          return { kind: "already" as const, donation: existing };
        }

        const blocked = annulBlockReason(existing.status);
        if (blocked) {
          return { kind: "refused" as const, message: blocked, status: existing.status };
        }

        const income = await findDonationIncome(tx, id);
        const verdict = analyzeAnnulment({
          donation: toAnnulmentDonation(existing),
          hasMovement: Boolean(income),
        });
        const result = await annulWithin(
          tx,
          existing,
          income,
          parsed.value.reason,
          sessionUser?.username ?? null,
        );
        return { kind: "annulled" as const, ...result, income, verdict };
      });

      if (outcome.kind === "not_found") {
        return res.status(404).json({ error: "not_found", message: "Donación no encontrada" });
      }
      if (outcome.kind === "already") {
        return res.status(409).json({
          error: "conflict",
          message: "La donación ya está anulada.",
          donation: await formatDonation(outcome.donation),
        });
      }
      if (outcome.kind === "refused") {
        return res.status(409).json({
          error: "conflict",
          message: outcome.message,
          status: outcome.status,
        });
      }

      // Confirmación contable: la cadena de la campaña afectada debe seguir
      // verificando después de añadir el asiento compensatorio.
      const ledger = outcome.income ? await verifyLedger(outcome.income.campaignId) : null;

      await logAuditAction({
        ...auditContext(req),
        action: AUDIT_ACTIONS.donationAnnulled,
        resource: AUDIT_RESOURCES.donations,
        resourceId: String(id),
        details: {
          amount: toSafeAmount(outcome.donation.amount),
          campaignId: outcome.donation.campaignId,
          reason: parsed.value.reason,
          reversalMovementId: outcome.reversalId,
          chainVerified: ledger?.verified ?? null,
        },
      });

      return res.json({
        ok: true,
        donation: await formatDonation(outcome.donation),
        reversal: { appended: outcome.reversalId !== null, movementId: outcome.reversalId },
        ledger,
        warnings: outcome.verdict.warnings,
      });
    } catch (err) {
      req.log.error({ err }, "Failed to annul donation");
      return res
        .status(500)
        .json({ error: "server_error", message: "No se pudo anular la donación." });
    }
  },
);

/**
 * GET /campaigns/:id/donations/void/preview — qué se anularía de una campaña:
 * cuántas donaciones, por cuánto, cuántas estaban conciliadas y cuáles no se
 * pueden tocar. Exclusivo del superadmin. NO modifica nada.
 */
router.get(
  "/campaigns/:id/donations/void/preview",
  ...superadminOnly,
  adminActionLimiter,
  async (req, res) => {
    const campaignId = Number(req.params.id);
    if (!Number.isInteger(campaignId) || campaignId <= 0) {
      return res.status(400).json({ error: "validation_error", message: "Identificador inválido" });
    }
    try {
      const [campaign] = await db
        .select({
          id: campaignsTable.id,
          title: campaignsTable.title,
          status: campaignsTable.status,
        })
        .from(campaignsTable)
        .where(eq(campaignsTable.id, campaignId));
      if (!campaign) {
        return res.status(404).json({ error: "not_found", message: "Campaña no encontrada" });
      }

      const rows = await db
        .select()
        .from(donationsTable)
        .where(eq(donationsTable.campaignId, campaignId));
      const incomeRows = await db
        .select({ sourceId: campaignMovementsTable.sourceId })
        .from(campaignMovementsTable)
        .where(
          and(
            eq(campaignMovementsTable.campaignId, campaignId),
            eq(campaignMovementsTable.sourceType, "donation"),
          ),
        );

      const plan = planCampaignAnnulment({
        campaignId,
        donations: rows.map(toAnnulmentDonation),
        movementDonationIds: incomeRows.map((row) => row.sourceId),
      });

      res.setHeader("Cache-Control", "private, no-store");
      return res.json({ campaign, plan });
    } catch (err) {
      req.log.error({ err }, "Failed to build donation annulment preview");
      return res
        .status(500)
        .json({ error: "server_error", message: "No se pudo analizar la campaña" });
    }
  },
);

/**
 * POST /campaigns/:id/donations/void — anula EN BLOQUE todas las donaciones
 * confirmadas de una campaña (un solo motivo, una sola transacción). Es la
 * operación para limpiar una campaña de prueba o corregida por completo.
 */
router.post(
  "/campaigns/:id/donations/void",
  ...superadminOnly,
  reauthLimiter,
  adminActionLimiter,
  async (req, res) => {
    const campaignId = Number(req.params.id);
    if (!Number.isInteger(campaignId) || campaignId <= 0) {
      return res.status(400).json({ error: "validation_error", message: "Identificador inválido" });
    }
    const parsed = validateAnnulmentRequest(req.body);
    if (!parsed.ok) {
      return res.status(400).json({ error: "validation_error", code: parsed.code, message: parsed.message });
    }

    const sessionUser = req.session?.adminUser ?? null;
    const reauth = await verifySuperadminReauth({
      userId: sessionUser?.id ?? null,
      username: sessionUser?.username ?? null,
      password: parsed.value.password,
      totpCode: parsed.value.totpCode,
    });
    if (!reauth.ok) {
      await logAuditAction({
        ...auditContext(req),
        action: AUDIT_ACTIONS.adminReauthFailed,
        resource: AUDIT_RESOURCES.campaigns,
        resourceId: String(campaignId),
        details: { operation: "campaign_donations_void", code: reauth.code },
      });
      return res.status(401).json({ error: "unauthorized", code: reauth.code, message: reauth.message });
    }

    try {
      const outcome = await db.transaction(async (tx) => {
        // Lock de la CAMPAÑA primero (mismo orden que la purga DEMO), y después
        // cada donación: serializa las anulaciones concurrentes de la campaña.
        const [campaign] = await tx
          .select()
          .from(campaignsTable)
          .where(eq(campaignsTable.id, campaignId))
          .for("update");
        if (!campaign) return { kind: "not_found" as const };

        const rows = await tx
          .select()
          .from(donationsTable)
          .where(eq(donationsTable.campaignId, campaignId));
        const incomeRows = await tx
          .select({
            id: campaignMovementsTable.id,
            sourceId: campaignMovementsTable.sourceId,
            campaignId: campaignMovementsTable.campaignId,
            amount: campaignMovementsTable.amount,
          })
          .from(campaignMovementsTable)
          .where(
            and(
              eq(campaignMovementsTable.campaignId, campaignId),
              eq(campaignMovementsTable.sourceType, "donation"),
            ),
          );
        const incomeByDonation = new Map(incomeRows.map((row) => [row.sourceId, row]));

        const plan = planCampaignAnnulment({
          campaignId,
          donations: rows.map(toAnnulmentDonation),
          movementDonationIds: incomeRows.map((row) => row.sourceId),
        });
        if (!plan.allowed) return { kind: "nothing" as const, plan };

        const applied: { donationId: number; amount: number; reversalId: number | null }[] = [];
        for (const item of plan.annullable) {
          const [row] = await tx
            .select()
            .from(donationsTable)
            .where(eq(donationsTable.id, item.donationId))
            .for("update");
          // Carrera: si otra petición ya la anuló (o cambió su estado), se salta.
          if (!row || isAnnulledDonation(row.status) || annulBlockReason(row.status)) continue;

          const result = await annulWithin(
            tx,
            row,
            incomeByDonation.get(item.donationId) ?? null,
            parsed.value.reason,
            sessionUser?.username ?? null,
          );
          applied.push({
            donationId: item.donationId,
            amount: item.amount,
            reversalId: result.reversalId,
          });
        }

        return { kind: "annulled" as const, campaign, plan, applied };
      });

      if (outcome.kind === "not_found") {
        return res.status(404).json({ error: "not_found", message: "Campaña no encontrada" });
      }
      if (outcome.kind === "nothing") {
        return res.status(409).json({
          error: "conflict",
          message:
            outcome.plan.blocked.length > 0
              ? "No hay donaciones confirmadas que se puedan anular en esta campaña."
              : "Esta campaña no tiene donaciones confirmadas que anular.",
          plan: outcome.plan,
        });
      }

      const ledger = await verifyLedger(campaignId);
      const totalAmount =
        Math.round(outcome.applied.reduce((sum, item) => sum + item.amount, 0) * 100) / 100;

      await logAuditAction({
        ...auditContext(req),
        action: AUDIT_ACTIONS.donationAnnulled,
        resource: AUDIT_RESOURCES.campaigns,
        resourceId: String(campaignId),
        details: {
          title: outcome.campaign.title,
          reason: parsed.value.reason,
          count: outcome.applied.length,
          totalAmount,
          donationIds: outcome.applied.map((item) => item.donationId),
          reversals: outcome.applied.filter((item) => item.reversalId !== null).length,
          skipped: outcome.plan.blocked,
          chainVerified: ledger.verified,
        },
      });

      return res.json({
        ok: true,
        campaign: { id: outcome.campaign.id, title: outcome.campaign.title },
        annulled: outcome.applied.length,
        totalAmount,
        reversals: outcome.applied.filter((item) => item.reversalId !== null).length,
        blocked: outcome.plan.blocked,
        ledger,
      });
    } catch (err) {
      req.log.error({ err }, "Failed to annul campaign donations");
      return res
        .status(500)
        .json({ error: "server_error", message: "No se pudieron anular las donaciones." });
    }
  },
);

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
        d.voided_at,
        d.voided_by,
        d.void_reason,
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

// PUT /donations/:id/fulfillment — solo admin.
//
// Cambia el estado de CUMPLIMIENTO del aporte (pendiente de coordinación →
// comprometida → recibida → verificada, o rechazada/cancelada) SIN tocar el estado
// CONTABLE: el dinero sigue sumando solo cuando su `status` es approved/reconciled.
// Así una promesa nunca se convierte en ingreso por cambiar de estado aquí.
//
// Para las donaciones de productos permite registrar la CANTIDAD REALMENTE
// RECIBIDA de cada ítem (lo prometido y lo recibido pueden no coincidir).
router.put(
  "/donations/:id/fulfillment",
  ...adminOnly,
  adminActionLimiter,
  async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: "validation_error", message: "ID inválido" });
    }

    const body = (req.body ?? {}) as {
      fulfillmentStatus?: unknown;
      receivedQuantities?: unknown;
    };
    // Validación ESTRICTA: si el valor no es un estado conocido, `normalize...`
    // devuelve el inicial y la comparación falla → 400 (nunca se acepta basura).
    const next = normalizeFulfillmentStatus(body.fulfillmentStatus);
    if (typeof body.fulfillmentStatus !== "string" || body.fulfillmentStatus !== next) {
      return res.status(400).json({
        error: "validation_error",
        message: "Estado de cumplimiento inválido.",
      });
    }

    try {
      const [donation] = await db.select().from(donationsTable).where(eq(donationsTable.id, id));
      if (!donation) {
        return res.status(404).json({ error: "not_found", message: "Donation not found" });
      }

      const current = normalizeFulfillmentStatus(donation.fulfillmentStatus);
      const blocked = fulfillmentBlockReason(current, next);
      if (blocked) {
        return res.status(400).json({ error: "validation_error", message: blocked });
      }

      // Cantidades realmente recibidas (opcional, solo para productos).
      const received = Array.isArray(body.receivedQuantities)
        ? (body.receivedQuantities as { id?: unknown; quantity?: unknown }[])
        : [];
      const receivedUpdates: { itemId: number; quantity: number }[] = [];
      for (const entry of received) {
        const itemId = Number(entry?.id);
        const quantity = Number(entry?.quantity);
        if (!Number.isInteger(itemId) || itemId <= 0) continue;
        if (!Number.isFinite(quantity) || quantity < 0) {
          return res.status(400).json({
            error: "validation_error",
            message: "La cantidad recibida no puede ser negativa.",
          });
        }
        receivedUpdates.push({ itemId, quantity });
      }

      const now = new Date();
      const actor = auditContext(req);
      await db.transaction(async (tx) => {
        await tx
          .update(donationsTable)
          .set({
            fulfillmentStatus: next,
            // Se sella la fecha en la que el aporte se da por recibido.
            receivedAt:
              next === "recibida" || next === "verificada" ? (donation.receivedAt ?? now) : donation.receivedAt,
            fulfillmentUpdatedAt: now,
            fulfillmentUpdatedBy: actor.username ?? null,
          })
          .where(eq(donationsTable.id, id));

        for (const update of receivedUpdates) {
          await tx
            .update(donationItemsTable)
            .set({ receivedQuantity: String(update.quantity) })
            .where(
              and(
                eq(donationItemsTable.id, update.itemId),
                eq(donationItemsTable.donationId, id),
              ),
            );
        }
      });

      await logAuditAction({
        ...actor,
        // El estado CONTABLE no cambia aquí: se reutiliza la acción de «estado
        // cambiado» y los detalles distinguen que es el CUMPLIMIENTO del aporte.
        action: AUDIT_ACTIONS.donationStatusChanged,
        resource: AUDIT_RESOURCES.donations,
        resourceId: String(id),
        details: {
          changed: "fulfillment",
          fulfillmentStatusFrom: current,
          fulfillmentStatusTo: next,
          fulfillmentStatusLabel: fulfillmentLabel(next),
          receivedItems: receivedUpdates.length,
        },
      });

      const [updated] = await db.select().from(donationsTable).where(eq(donationsTable.id, id));
      const items = await db
        .select()
        .from(donationItemsTable)
        .where(eq(donationItemsTable.donationId, id));
      return res.json(await formatDonation(updated ?? donation, null, items));
    } catch (err) {
      req.log.error({ err, id }, "Failed to update donation fulfillment");
      return res.status(500).json({
        error: "server_error",
        message: "No se pudo actualizar el estado del aporte.",
      });
    }
  },
);

async function formatDonation(
  d: typeof donationsTable.$inferSelect,
  campaignTitle: string | null = null,
  items: unknown[] | null = null,
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
    // Traza de la anulación contable (migración 027): quién, cuándo y por qué.
    voidedAt: d.voidedAt instanceof Date && !Number.isNaN(d.voidedAt.getTime()) ? d.voidedAt.toISOString() : null,
    voidedBy: d.voidedBy,
    voidReason: d.voidReason,
    // V20: cumplimiento del aporte (columna paralela al estado contable) y el
    // código de seguimiento que se le dio al donante.
    fulfillmentStatus: d.fulfillmentStatus,
    trackingCode: d.trackingCode,
    contactConsent: d.contactConsent,
    orgName: d.orgName,
    // Ítems de una donación en especie. Se pasan desde el llamador (solo el
    // detalle y la creación los cargan) para no provocar un N+1 en los listados.
    items,
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
  const voidedAtRaw = r.voided_at;
  const voidedAt =
    voidedAtRaw instanceof Date && !Number.isNaN(voidedAtRaw.getTime())
      ? voidedAtRaw.toISOString()
      : typeof voidedAtRaw === "string" && !Number.isNaN(new Date(voidedAtRaw).getTime())
        ? new Date(voidedAtRaw).toISOString()
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
    // Traza de la anulación contable (migración 027).
    voidedAt,
    voidedBy: r.voided_by ?? null,
    voidReason: r.void_reason ?? null,
    // V20: se devuelven tal cual venga la consulta. Si el SQL del listado aún no
    // selecciona las columnas nuevas, quedan en `null` (nunca se inventa un
    // estado): así el panel no muestra un cumplimiento falso.
    fulfillmentStatus: r.fulfillment_status ?? null,
    trackingCode: r.tracking_code ?? null,
    contactConsent: r.contact_consent ?? null,
    orgName: r.org_name ?? null,
    items: null,
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

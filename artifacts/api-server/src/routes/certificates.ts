import { Router, type IRouter } from "express";
import { db, certificatesTable, campaignsTable, insertCertificateSchema } from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import { requireAdmin } from "../middleware/require-admin";
import { adminActionLimiter } from "../middleware/rate-limit";
import {
  canRevoke,
  generateCertificateCode,
  isCertificateType,
  isValidCertificateCode,
  normalizeCertificateCode,
  publicCertificate,
  validateRevocation,
} from "../lib/certificates";

const router: IRouter = Router();

/** Fecha de hoy en ISO corto (YYYY-MM-DD), la que usa el esquema. */
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Proyección administrativa: incluye estado y motivo de revocación. */
function adminCertificate(row: typeof certificatesTable.$inferSelect) {
  return {
    id: row.id,
    code: row.code,
    holderName: row.holderName,
    type: row.type,
    title: row.title,
    description: row.description,
    campaignId: row.campaignId,
    issuedAt: row.issuedAt,
    status: row.status,
    revokedAt: row.revokedAt,
    revocationReason: row.revocationReason,
    createdAt: row.createdAt,
  };
}

/**
 * GET /certificates/:code — PÚBLICO. Es lo que abre el QR: devuelve el
 * certificado para poder compartirlo por enlace. 400 si el código no tiene forma
 * válida y 404 si no existe **o está revocado** (un certificado revocado deja de
 * publicarse). Nunca expone el id interno ni ningún dato de contacto.
 */
router.get("/certificates/:code", async (req, res) => {
  const code = normalizeCertificateCode(req.params.code);
  if (!code || !isValidCertificateCode(code)) {
    return res.status(400).json({ error: "validation_error", message: "Código de certificado inválido." });
  }
  try {
    const [row] = await db
      .select()
      .from(certificatesTable)
      .where(eq(certificatesTable.code, code));

    const published = publicCertificate(row ?? null);
    if (!published) {
      return res.status(404).json({ error: "not_found", message: "Certificado no encontrado." });
    }

    let campaignTitle: string | null = null;
    if (row?.campaignId) {
      const [campaign] = await db
        .select({ title: campaignsTable.title })
        .from(campaignsTable)
        .where(eq(campaignsTable.id, row.campaignId));
      campaignTitle = campaign?.title ?? null;
    }

    return res.json({ ...published, campaignTitle });
  } catch (err) {
    req.log.error({ err }, "Failed to load certificate");
    return res.status(500).json({ error: "server_error", message: "No se pudo cargar el certificado." });
  }
});

/** GET /admin/certificates — listado del panel (todos los estados). */
router.get("/admin/certificates", requireAdmin, async (req, res) => {
  try {
    const status = typeof req.query.status === "string" ? req.query.status.trim() : "";
    const rows = status
      ? await db
          .select()
          .from(certificatesTable)
          .where(eq(certificatesTable.status, status))
          .orderBy(desc(certificatesTable.createdAt))
      : await db.select().from(certificatesTable).orderBy(desc(certificatesTable.createdAt));
    return res.json(rows.map(adminCertificate));
  } catch (err) {
    req.log.error({ err }, "Failed to list certificates");
    return res.status(500).json({ error: "server_error", message: "No se pudieron listar los certificados." });
  }
});

/**
 * POST /admin/certificates — emite un certificado. El **código lo genera el
 * servidor** (nunca lo propone el cliente) y se reintenta si chocara con otro.
 */
router.post("/admin/certificates", requireAdmin, adminActionLimiter, async (req, res) => {
  const parsed = insertCertificateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "validation_error",
      message: "Datos del certificado inválidos.",
      details: parsed.error.issues,
    });
  }

  const data = parsed.data;
  if (!isCertificateType(data.type)) {
    return res.status(400).json({ error: "validation_error", message: "Tipo de certificado inválido." });
  }
  const issuedAt = (data.issuedAt ?? "").trim() || todayIso();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(issuedAt)) {
    return res.status(400).json({ error: "validation_error", message: "La fecha debe tener el formato AAAA-MM-DD." });
  }

  try {
    // Colisión de código: improbable (30^12), pero se reintenta en vez de fallar.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const code = generateCertificateCode();
      try {
        const [created] = await db
          .insert(certificatesTable)
          .values({
            code,
            holderName: data.holderName.trim().slice(0, 160),
            type: data.type,
            title: data.title.trim().slice(0, 160),
            description: data.description?.trim().slice(0, 600) || null,
            campaignId: data.campaignId ?? null,
            issuedAt,
          })
          .returning();
        return res.status(201).json(adminCertificate(created));
      } catch (err) {
        const isDuplicate =
          typeof err === "object" &&
          err !== null &&
          String((err as { code?: unknown }).code) === "23505";
        if (!isDuplicate) throw err;
        req.log.warn({ err }, "Certificate code collision, retrying");
      }
    }
    return res.status(500).json({
      error: "server_error",
      message: "No se pudo generar un código único. Inténtalo de nuevo.",
    });
  } catch (err) {
    req.log.error({ err }, "Failed to create certificate");
    return res.status(500).json({ error: "server_error", message: "No se pudo emitir el certificado." });
  }
});

/**
 * PATCH /admin/certificates/:id — corrige los datos o revoca. Revocar **exige
 * motivo** (queda guardado con la fecha), y reactivar es una acción deliberada
 * que limpia ese motivo.
 */
router.patch("/admin/certificates/:id", requireAdmin, adminActionLimiter, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "validation_error", message: "Identificador inválido." });
  }

  const body = (req.body ?? {}) as Record<string, unknown>;

  try {
    const [row] = await db.select().from(certificatesTable).where(eq(certificatesTable.id, id));
    if (!row) {
      return res.status(404).json({ error: "not_found", message: "Certificado no encontrado." });
    }

    const updates: Partial<typeof certificatesTable.$inferInsert> = {};

    if (typeof body.holderName === "string" && body.holderName.trim()) {
      updates.holderName = body.holderName.trim().slice(0, 160);
    }
    if (typeof body.title === "string" && body.title.trim()) {
      updates.title = body.title.trim().slice(0, 160);
    }
    if (typeof body.description === "string") {
      updates.description = body.description.trim().slice(0, 600) || null;
    }
    if (typeof body.type === "string") {
      if (!isCertificateType(body.type)) {
        return res.status(400).json({ error: "validation_error", message: "Tipo de certificado inválido." });
      }
      updates.type = body.type;
    }

    if (body.status === "revoked") {
      if (!canRevoke(row.status)) {
        return res.status(409).json({ error: "conflict", message: "El certificado ya está revocado." });
      }
      const check = validateRevocation(body.revocationReason);
      if (!check.ok) {
        return res.status(400).json({ error: "validation_error", message: check.message });
      }
      updates.status = "revoked";
      updates.revokedAt = new Date();
      updates.revocationReason = check.reason;
    } else if (body.status === "issued" && row.status === "revoked") {
      updates.status = "issued";
      updates.revokedAt = null;
      updates.revocationReason = null;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: "validation_error", message: "No hay cambios que aplicar." });
    }

    const [updated] = await db
      .update(certificatesTable)
      .set(updates)
      .where(eq(certificatesTable.id, id))
      .returning();

    return res.json(adminCertificate(updated));
  } catch (err) {
    req.log.error({ err }, "Failed to update certificate");
    return res.status(500).json({ error: "server_error", message: "No se pudo actualizar el certificado." });
  }
});

export default router;

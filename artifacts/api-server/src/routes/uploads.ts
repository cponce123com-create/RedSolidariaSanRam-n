import { Router, type IRouter } from "express";
import {
  getUploadSignature,
  isCloudinaryConfigured,
  INSTITUTIONAL_ASSET_KINDS,
  isInstitutionalAssetKind,
} from "../lib/cloudinary";
import { requireAdmin } from "../middleware/require-admin";
import { requireRole, ROLES } from "../middleware/roles";

// Subidas del sistema: solo administrador o superadmin.
const adminOnly = [requireAdmin, requireRole(ROLES.ADMIN)];
import { adminActionLimiter, uploadSignatureLimiter } from "../middleware/rate-limit";

const router: IRouter = Router();

// Firma pública para comprobantes de donación (el donante no está logueado)
router.post("/uploads/signature", uploadSignatureLimiter, (_req, res) => {
  if (!isCloudinaryConfigured()) {
    return res.status(503).json({
      error: "upload_unavailable",
      message: "Cloudinary no está configurado. Contacta al administrador.",
    });
  }
  return res.json(getUploadSignature("donation-proofs"));
});

// Firma para admin: comprobantes de gastos y evidencias de campaña
router.post(
  "/uploads/admin-signature",
  ...adminOnly,
  adminActionLimiter,
  (_req, res) => {
    if (!isCloudinaryConfigured()) {
      return res.status(503).json({
        error: "upload_unavailable",
        message: "Cloudinary no está configurado.",
      });
    }
    return res.json(getUploadSignature("campaign-evidence"));
  },
);

/**
 * Firma para la IDENTIDAD INSTITUCIONAL (Fase 3 · V18): logotipo, portada, favicon y
 * fotos de «Nuestra historia». Solo superadmin.
 *
 * El cliente indica el TIPO de activo (`kind`), pero la CARPETA y los FORMATOS
 * permitidos los fija el SERVIDOR (`INSTITUTIONAL_ASSET_KINDS`): el cliente no puede
 * pedir una carpeta arbitraria ni ampliar los formatos (el favicon es solo PNG/WebP).
 * El borrado de assets solo actúa sobre publicIds de nuestras carpetas.
 */
router.post(
  "/uploads/institutional-signature",
  requireRole(ROLES.SUPERADMIN),
  adminActionLimiter,
  (req, res) => {
    if (!isCloudinaryConfigured()) {
      return res.status(503).json({
        error: "upload_unavailable",
        message: "Cloudinary no está configurado.",
      });
    }
    const requested = (req.body ?? {}) as { kind?: unknown };
    const kind = isInstitutionalAssetKind(requested.kind) ? requested.kind : "logo";
    const { folder, allowedFormats } = INSTITUTIONAL_ASSET_KINDS[kind];
    const signature = getUploadSignature(folder, { allowedFormats });
    if (!signature) {
      return res.status(503).json({
        error: "upload_unavailable",
        message: "Cloudinary no está configurado.",
      });
    }
    return res.json({ ...signature, kind });
  },
);

export default router;

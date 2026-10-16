import { Router, type IRouter } from "express";
import {
  getUploadSignature,
  isCloudinaryConfigured,
  INSTITUTIONAL_IDENTITY_FOLDER,
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

// Firma para la IDENTIDAD INSTITUCIONAL (Fase 3): logotipo, portada y fotos de
// «Nuestra historia». Solo superadmin. La carpeta la fija el SERVIDOR (el cliente
// no puede pedir una carpeta arbitraria), así que el borrado de assets solo actúa
// sobre nuestra carpeta y nunca sobre archivos compartidos.
router.post(
  "/uploads/institutional-signature",
  requireRole(ROLES.SUPERADMIN),
  adminActionLimiter,
  (_req, res) => {
    if (!isCloudinaryConfigured()) {
      return res.status(503).json({
        error: "upload_unavailable",
        message: "Cloudinary no está configurado.",
      });
    }
    return res.json(getUploadSignature(INSTITUTIONAL_IDENTITY_FOLDER));
  },
);

export default router;

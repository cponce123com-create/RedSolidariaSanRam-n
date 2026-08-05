import { Router, type IRouter } from "express";
import {
  getUploadSignature,
  isCloudinaryConfigured,
} from "../lib/cloudinary";
import { requireAdmin } from "../middleware/require-admin";
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
  requireAdmin,
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

export default router;

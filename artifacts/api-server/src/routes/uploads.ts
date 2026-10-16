import { Router, type IRouter } from "express";
import {
  getUploadSignature,
  isCloudinaryConfigured,
  INSTITUTIONAL_ASSET_KINDS,
  isInstitutionalAssetKind,
  cmsAssetFolder,
} from "../lib/cloudinary";
import {
  cleanupCloudinaryAssetsByPublicId,
  type CleanupLogger,
} from "../lib/asset-cleanup";
import { isCmsPageSlug } from "../lib/cms-content";
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

/**
 * Firma para las imágenes del CMS (Fase 2–4). Solo superadmin.
 *
 * El cliente indica la PÁGINA (`page`), pero la CARPETA la fija el SERVIDOR a partir
 * del registro de páginas (`cms/<slug>`): el cliente no puede pedir una carpeta
 * arbitraria. El borrado de assets solo actúa sobre publicIds con el prefijo `cms/`.
 */
router.post(
  "/uploads/cms-signature",
  requireRole(ROLES.SUPERADMIN),
  adminActionLimiter,
  (req, res) => {
    if (!isCloudinaryConfigured()) {
      return res.status(503).json({
        error: "upload_unavailable",
        message: "Cloudinary no está configurado.",
      });
    }
    const requested = (req.body ?? {}) as { page?: unknown };
    if (!isCmsPageSlug(requested.page)) {
      return res.status(400).json({
        error: "validation_error",
        message: "Indica una página válida del CMS.",
      });
    }
    const folder = cmsAssetFolder(requested.page);
    const signature = getUploadSignature(folder, { allowedFormats: "jpg,png,webp" });
    if (!signature) {
      return res.status(503).json({
        error: "upload_unavailable",
        message: "Cloudinary no está configurado.",
      });
    }
    return res.json({ ...signature, page: requested.page });
  },
);

/** PNG 1×1 transparente: el activo más pequeño posible para probar la firma. */
const CHECK_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

interface CloudinaryCheckResult {
  ok: boolean;
  configured: boolean;
  status: number | null;
  cloudName: string | null;
  /** Mensaje LITERAL que devolvió Cloudinary (p. ej. «Invalid Signature …»). */
  cloudinaryMessage: string | null;
  /** Qué revisar, en lenguaje llano. */
  hints: string[];
}

/**
 * Comprobación REAL de la configuración de Cloudinary (V18.1).
 *
 * Sube un PNG de 1×1 con EXACTAMENTE la misma firma y los mismos parámetros que usa
 * el navegador, y borra el activo acto seguido. Sirve para distinguir de una vez:
 *   · credenciales mal configuradas (401 «Invalid credentials»),
 *   · firma inválida (401 «Invalid Signature»),
 *   · parámetros rechazados (400),
 *   · Cloudinary inaccesible desde el servidor.
 * Nunca devuelve el secreto ni la clave; solo el cloud name (que es público).
 */
async function checkCloudinaryUpload(log: CleanupLogger): Promise<CloudinaryCheckResult> {
  if (!isCloudinaryConfigured()) {
    return {
      ok: false,
      configured: false,
      status: null,
      cloudName: null,
      cloudinaryMessage: null,
      hints: [
        "Falta CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY o CLOUDINARY_API_SECRET en el entorno del servidor.",
      ],
    };
  }

  const signature = getUploadSignature("institutional-identity/_diagnostico", {
    allowedFormats: "png",
  });
  if (!signature) {
    return {
      ok: false,
      configured: false,
      status: null,
      cloudName: null,
      cloudinaryMessage: null,
      hints: ["Cloudinary no está configurado en el servidor."],
    };
  }

  // MISMOS parámetros que envía el navegador: si la firma fuese el problema, aquí
  // fallaría igual.
  const form = new FormData();
  form.append(
    "file",
    new Blob([Buffer.from(CHECK_PNG_BASE64, "base64")], { type: "image/png" }),
    "diagnostico.png",
  );
  form.append("folder", signature.folder);
  form.append("public_id", signature.publicId);
  form.append("timestamp", signature.timestamp);
  form.append("api_key", signature.apiKey);
  form.append("signature", signature.signature);
  form.append("allowed_formats", signature.allowedFormats);

  let response: Response;
  try {
    response = await fetch(
      `https://api.cloudinary.com/v1_1/${signature.cloudName}/image/upload`,
      { method: "POST", body: form },
    );
  } catch (err) {
    log.warn({ err }, "Cloudinary check: no se pudo contactar con la API");
    return {
      ok: false,
      configured: true,
      status: null,
      cloudName: signature.cloudName,
      cloudinaryMessage: null,
      hints: [
        "No se pudo contactar con api.cloudinary.com desde el servidor: revisa la red o si el proveedor bloquea la salida.",
      ],
    };
  }

  const payload = (await response.json().catch(() => null)) as {
    public_id?: string;
    error?: { message?: string };
  } | null;

  if (!response.ok) {
    const message = payload?.error?.message ?? null;
    const hints: string[] = [];
    if (response.status === 401 || response.status === 403) {
      hints.push(
        `Revisa que CLOUDINARY_API_KEY y CLOUDINARY_API_SECRET sean del cloud «${signature.cloudName}» (cada cloud tiene las suyas).`,
      );
      hints.push(
        "Vuelve a pegar las variables en Render: un espacio o un salto de línea al final también invalida la firma.",
      );
      if (message && /signature/i.test(message)) {
        hints.push(
          "«Invalid Signature» significa que la clave y el secreto no corresponden a este cloud (o el secreto está incompleto).",
        );
      }
    } else if (response.status === 400) {
      hints.push("Cloudinary rechazó algún parámetro de la petición de subida.");
    }
    return {
      ok: false,
      configured: true,
      status: response.status,
      cloudName: signature.cloudName,
      cloudinaryMessage: message,
      hints,
    };
  }

  // Éxito: se borra el activo de diagnóstico para no dejar basura.
  const createdId = payload?.public_id ?? signature.publicId;
  await cleanupCloudinaryAssetsByPublicId([createdId], log);

  return {
    ok: true,
    configured: true,
    status: response.status,
    cloudName: signature.cloudName,
    cloudinaryMessage: null,
    hints: [
      "La firma del servidor y las credenciales funcionan: la subida desde el navegador debería completarse.",
    ],
  };
}

/**
 * POST /uploads/cloudinary-check — diagnóstico de la subida (solo superadmin).
 * Devuelve siempre 200: el resultado es el diagnóstico, no un fallo de la petición.
 */
router.post(
  "/uploads/cloudinary-check",
  requireRole(ROLES.SUPERADMIN),
  adminActionLimiter,
  async (req, res) => {
    try {
      const result = await checkCloudinaryUpload(req.log as unknown as CleanupLogger);
      res.setHeader("Cache-Control", "private, no-store");
      return res.json(result);
    } catch (err) {
      req.log.error({ err }, "Cloudinary check failed");
      return res.status(500).json({
        error: "server_error",
        message: "No se pudo comprobar la configuración de Cloudinary.",
      });
    }
  },
);

export default router;

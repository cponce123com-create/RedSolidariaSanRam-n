import { createHash, randomUUID } from "node:crypto";

const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
const apiKey = process.env.CLOUDINARY_API_KEY;
const apiSecret = process.env.CLOUDINARY_API_SECRET;

export function isCloudinaryConfigured(): boolean {
  return Boolean(cloudName && apiKey && apiSecret);
}

/**
 * Firma para upload directo del navegador (signed upload de Cloudinary).
 * El cliente sube el archivo a https://api.cloudinary.com/v1_1/<cloud>/image/upload
 * con estos parámetros + el archivo; sin la firma Cloudinary rechaza el upload.
 */
export function createUploadSignature(
  params: Record<string, string>,
  secret: string,
): string {
  const sorted = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
  return createHash("sha1").update(`${sorted}${secret}`).digest("hex");
}

export interface UploadSignature {
  cloudName: string;
  apiKey: string;
  timestamp: string;
  publicId: string;
  folder: string;
  // Restricciones firmadas: el cliente debe enviarlas tal cual al subir o
  // Cloudinary rechaza la petición (formato y tamaño máximos).
  allowedFormats: string;
  maxBytes: string;
  signature: string;
}

// Formatos y tamaño máximo permitidos en las subidas firmadas. Coinciden con
// la validación del cliente (validateProofImage): imágenes JPG/PNG/WebP ≤ 8 MB.
// Al estar firmados, el cliente no puede alterarlos sin invalidar la firma.
const ALLOWED_UPLOAD_FORMATS = "jpg,png,webp";
const MAX_UPLOAD_BYTES = String(8 * 1024 * 1024);

export function getUploadSignature(
  folder: string,
): UploadSignature | null {
  if (!isCloudinaryConfigured()) return null;
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const publicId = randomUUID();
  const params: Record<string, string> = {
    folder,
    public_id: publicId,
    timestamp,
    allowed_formats: ALLOWED_UPLOAD_FORMATS,
    max_bytes: MAX_UPLOAD_BYTES,
  };
  return {
    cloudName: cloudName!,
    apiKey: apiKey!,
    timestamp,
    publicId,
    folder,
    allowedFormats: ALLOWED_UPLOAD_FORMATS,
    maxBytes: MAX_UPLOAD_BYTES,
    signature: createUploadSignature(params, apiSecret!),
  };
}

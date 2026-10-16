import { createHash, randomUUID } from "node:crypto";

const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
const apiKey = process.env.CLOUDINARY_API_KEY;
const apiSecret = process.env.CLOUDINARY_API_SECRET;

export function isCloudinaryConfigured(): boolean {
  return Boolean(cloudName && apiKey && apiSecret);
}

/**
 * Firma para upload directo del navegador (SIGNED upload de Cloudinary).
 *
 * El cliente sube el archivo a https://api.cloudinary.com/v1_1/<cloud>/image/upload
 * con estos parámetros + el archivo; sin la firma Cloudinary rechaza el upload.
 *
 * NO se usa un «upload preset» sin firmar: con firma, las restricciones (carpeta,
 * formatos permitidos, public_id) van DENTRO de la firma y el cliente no puede
 * alterarlas. El `cloud name` sale de `CLOUDINARY_CLOUD_NAME` (entorno del
 * servidor) y se devuelve al cliente para construir la URL; el
 * `CLOUDINARY_API_SECRET` NUNCA sale del servidor (no aparece en esta respuesta).
 * El límite de tamaño se valida en el navegador (`validateProofImage`): la API de
 * Cloudinary no acepta un parámetro de tamaño máximo en la subida.
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

/**
 * Carpeta de Cloudinary para la identidad institucional (Fase 3). Se fija en el
 * servidor: la firma solo se emite para esta carpeta, así el cliente no puede
 * subir a carpetas arbitrarias. El borrado de assets solo actúa sobre publicIds
 * con este prefijo (nunca archivos compartidos).
 */
export const INSTITUTIONAL_IDENTITY_FOLDER = "institutional-identity";

/**
 * Carpeta y formatos permitidos por TIPO de activo de la identidad institucional
 * (V18). El favicon solo admite PNG/WebP: un icono a 32 px no debe ser JPG (pierde
 * transparencia y nitidez). La carpeta la fija el SERVIDOR, así el cliente no puede
 * subir a carpetas arbitrarias.
 */
export const INSTITUTIONAL_ASSET_KINDS = {
  logo: { folder: "institutional-identity/logo", allowedFormats: "jpg,png,webp" },
  cover: { folder: "institutional-identity/cover", allowedFormats: "jpg,png,webp" },
  favicon: { folder: "institutional-identity/favicon", allowedFormats: "png,webp" },
  story: { folder: "institutional-identity/story", allowedFormats: "jpg,png,webp" },
} as const;

export type InstitutionalAssetKind = keyof typeof INSTITUTIONAL_ASSET_KINDS;

export function isInstitutionalAssetKind(value: unknown): value is InstitutionalAssetKind {
  return typeof value === "string" && value in INSTITUTIONAL_ASSET_KINDS;
}

export function getUploadSignature(
  folder: string,
  opts: { allowedFormats?: string } = {},
): UploadSignature | null {
  if (!isCloudinaryConfigured()) return null;
  // Los formatos viajan DENTRO de la firma: el cliente no puede ampliarlos.
  const allowedFormats = opts.allowedFormats ?? ALLOWED_UPLOAD_FORMATS;
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const publicId = randomUUID();
  const params: Record<string, string> = {
    folder,
    public_id: publicId,
    timestamp,
    allowed_formats: allowedFormats,
    max_bytes: MAX_UPLOAD_BYTES,
  };
  return {
    cloudName: cloudName!,
    apiKey: apiKey!,
    timestamp,
    publicId,
    folder,
    allowedFormats,
    maxBytes: MAX_UPLOAD_BYTES,
    signature: createUploadSignature(params, apiSecret!),
  };
}

import { createHash, randomUUID } from "node:crypto";

/**
 * Credenciales de Cloudinary.
 *
 * Se hace `trim()` a propósito: al pegar las variables en Render es facil que se
 * cuele un espacio o un salto de linea al final. Un secreto con un salto de linea
 * produce una FIRMA VÁLIDA para nosotros pero INVÁLIDA para Cloudinary → la subida
 * falla con `401 Invalid Signature` sin ninguna pista. El trim elimina esa causa.
 */
const cloudName = process.env.CLOUDINARY_CLOUD_NAME?.trim();
const apiKey = process.env.CLOUDINARY_API_KEY?.trim();
const apiSecret = process.env.CLOUDINARY_API_SECRET?.trim();

export function isCloudinaryConfigured(): boolean {
  return Boolean(cloudName && apiKey && apiSecret);
}

/** Cloud name configurado (es público: aparece en las URLs de entrega). */
export function getCloudName(): string | null {
  return cloudName ?? null;
}

/**
 * Firma para upload directo del navegador (SIGNED upload de Cloudinary).
 *
 * El cliente sube el archivo a https://api.cloudinary.com/v1_1/<cloud>/image/upload
 * con estos parámetros + el archivo; sin la firma Cloudinary rechaza el upload.
 *
 * REGLA CRÍTICA: la firma se calcula EXACTAMENTE sobre los parámetros que el cliente
 * envía, y solo sobre parámetros que Cloudinary RECONOCE. Firmar un parámetro
 * desconocido (o enviar uno sin firmar) hace que Cloudinary responda 401
 * «Invalid Signature». Por eso ya NO se firma `max_bytes`: no es un parámetro de la
 * API de subida de Cloudinary (el límite de tamaño se valida en el navegador, en
 * `image-validation`).
 *
 * NO se usa un «upload preset» sin firmar: con firma, las restricciones (carpeta,
 * formatos permitidos, public_id) van DENTRO de la firma y el cliente no puede
 * alterarlas. El `CLOUDINARY_API_SECRET` NUNCA sale del servidor.
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
  // Restricción firmada: el cliente debe enviarla tal cual o Cloudinary invalida la
  // subida. `allowed_formats` SÍ es un parámetro reconocido por Cloudinary.
  allowedFormats: string;
  signature: string;
}

// Formatos y tamaño máximo permitidos. Coinciden con la validación del cliente
// (`image-validation`): imágenes JPG/PNG/WebP ≤ 8 MB.
const ALLOWED_UPLOAD_FORMATS = "jpg,png,webp";

/**
 * Carpeta raíz de Cloudinary para la identidad institucional (Fase 3). Se fija en
 * el servidor: la firma solo se emite para nuestras carpetas, así el cliente no
 * puede subir a carpetas arbitrarias. El borrado de assets solo actúa sobre
 * publicIds con este prefijo (nunca archivos compartidos).
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

/**
 * Carpeta raíz de Cloudinary para las imágenes del CMS. La subcarpeta es por
 * PÁGINA (`cms/<slug>`), y el `slug` se valida contra el registro de páginas en el
 * servidor: el cliente no puede pedir una carpeta arbitraria. El borrado de assets
 * solo actúa sobre publicIds con el prefijo `cms/`.
 */
export const CMS_FOLDER = "cms";

export function cmsAssetFolder(slug: string): string {
  return `${CMS_FOLDER}/${slug}`;
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
  // SOLO parámetros que Cloudinary reconoce en /image/upload.
  const params: Record<string, string> = {
    folder,
    public_id: publicId,
    timestamp,
    allowed_formats: allowedFormats,
  };
  return {
    cloudName: cloudName!,
    apiKey: apiKey!,
    timestamp,
    publicId,
    folder,
    allowedFormats,
    signature: createUploadSignature(params, apiSecret!),
  };
}

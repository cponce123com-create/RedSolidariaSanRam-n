import { describeUploadFailure } from "./upload-error-message";

export interface UploadedImage {
  imageUrl: string;
  publicId: string;
}

/** Códigos de error de validación local: el mensaje lo traduce el llamador (i18n). */
export type ProofImageError = "type" | "size";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_SIZE = 8 * 1024 * 1024; // 8 MB

/** Origen del API de Cloudinary. Debe estar autorizado en el CSP (`connect-src`). */
const CLOUDINARY_UPLOAD_ORIGIN = "https://api.cloudinary.com";

/**
 * Valida el archivo y devuelve un CÓDIGO de error ("type" | "size") o null.
 * No devuelve texto: los mensajes son responsabilidad del llamador
 * (DonationModal traduce vía i18n; ImageUploadField/panel admin mantienen es).
 */
export function validateProofImage(file: File): ProofImageError | null {
  if (!ALLOWED_TYPES.includes(file.type)) {
    return "type";
  }
  if (file.size > MAX_SIZE) {
    return "size";
  }
  return null;
}

/**
 * Error de subida con código para que el cliente distinga entre fallo de firma
 * (`init`) y fallo de la subida a Cloudinary (`upload`), y `kind` con la causa
 * concreta (network/signature/format/size/server/unknown). El mensaje va en
 * español y es apto para mostrar al administrador tal cual.
 */
export class UploadError extends Error {
  public readonly code: "init" | "upload";
  public readonly kind: string;

  constructor(message: string, code: "init" | "upload", kind = "unknown") {
    super(message);
    this.name = "UploadError";
    this.code = code;
    this.kind = kind;
  }
}

interface UploadSignaturePayload {
  cloudName: string;
  apiKey: string;
  timestamp: string;
  publicId: string;
  folder: string;
  allowedFormats: string;
  maxBytes: string;
  signature: string;
}

/**
 * Sube la imagen directamente a Cloudinary usando una firma del servidor.
 * Sin la firma (emitida por la API), Cloudinary rechaza el archivo.
 *
 * TODOS los fallos se traducen a mensajes accionables (`describeUploadFailure`).
 * En particular, si el navegador bloquea `api.cloudinary.com` por CSP (o falla la
 * red), `fetch` RECHAZA la promesa; antes eso escapaba como un «Failed to fetch»
 * crudo y ahora se explica al administrador.
 */
export async function uploadImageToCloudinary(
  file: File,
  endpoint:
    | "/api/uploads/signature"
    | "/api/uploads/admin-signature"
    | "/api/uploads/institutional-signature",
): Promise<UploadedImage> {
  // ─── 1) Firma del servidor ────────────────────────────────────────────────
  let sig: UploadSignaturePayload;
  try {
    const res = await fetch(endpoint, { method: "POST" });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { message?: string } | null;
      const failure = describeUploadFailure({
        status: res.status,
        serverMessage: body?.message ?? null,
      });
      throw new UploadError(failure.message, "init", failure.kind);
    }
    sig = (await res.json()) as UploadSignaturePayload;
  } catch (err) {
    if (err instanceof UploadError) throw err;
    // `fetch` rechazado (sin red o bloqueado por el navegador): mensaje claro.
    throw new UploadError(describeUploadFailure({ networkError: true }).message, "init", "network");
  }

  // ─── 2) Subida directa a Cloudinary ───────────────────────────────────────
  const form = new FormData();
  form.append("file", file);
  form.append("folder", sig.folder);
  form.append("public_id", sig.publicId);
  form.append("timestamp", sig.timestamp);
  form.append("api_key", sig.apiKey);
  form.append("signature", sig.signature);
  // Parámetros firmados por el servidor: si el cliente no los envía tal cual,
  // Cloudinary invalida la subida (formato y tamaño máximos).
  form.append("allowed_formats", sig.allowedFormats);
  form.append("max_bytes", sig.maxBytes);

  let upload: Response;
  try {
    upload = await fetch(`${CLOUDINARY_UPLOAD_ORIGIN}/v1_1/${sig.cloudName}/image/upload`, {
      method: "POST",
      body: form,
    });
  } catch {
    // CASO REAL que rompía la subida: si el CSP no autoriza api.cloudinary.com (o
    // falla la red), el navegador RECHAZA la promesa. Se convierte en un mensaje
    // comprensible en lugar de un error técnico.
    throw new UploadError(describeUploadFailure({ networkError: true }).message, "upload", "network");
  }

  if (!upload.ok) {
    const body = (await upload.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    const failure = describeUploadFailure({
      status: upload.status,
      cloudinaryMessage: body?.error?.message ?? null,
    });
    throw new UploadError(failure.message, "upload", failure.kind);
  }

  const data = (await upload.json()) as { secure_url?: string; public_id?: string };
  if (!data.secure_url) {
    throw new UploadError(describeUploadFailure({}).message, "upload", "unknown");
  }

  return {
    imageUrl: data.secure_url,
    publicId: data.public_id ?? sig.publicId,
  };
}

export interface UploadedImage {
  imageUrl: string;
  publicId: string;
}

/** Códigos de error de validación local: el mensaje lo traduce el llamador (i18n). */
export type ProofImageError = "type" | "size";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_SIZE = 8 * 1024 * 1024; // 8 MB

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
 * Error de subida con código para que el cliente distinga entre fallo de
 * firma (init) y fallo de la subida a Cloudinary (upload) y pueda traducir.
 * El mensaje en español se conserva como fallback para el panel admin.
 */
export class UploadError extends Error {
  public readonly code: "init" | "upload";

  constructor(message: string, code: "init" | "upload") {
    super(message);
    this.name = "UploadError";
    this.code = code;
  }
}

/**
 * Sube la imagen directamente a Cloudinary usando una firma del servidor.
 * Sin la firma (emitida por la API), Cloudinary rechaza el archivo.
 */
export async function uploadImageToCloudinary(
  file: File,
  endpoint: "/api/uploads/signature" | "/api/uploads/admin-signature",
): Promise<UploadedImage> {
  const res = await fetch(endpoint, { method: "POST" });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new UploadError(
      (body as { message?: string } | null)?.message ||
        "No se pudo iniciar la subida. Intenta más tarde.",
      "init",
    );
  }
  const sig = await res.json();

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

  const upload = await fetch(
    `https://api.cloudinary.com/v1_1/${sig.cloudName}/image/upload`,
    { method: "POST", body: form },
  );
  if (!upload.ok) {
    throw new UploadError("Error al subir la imagen. Intenta más tarde.", "upload");
  }
  const data = await upload.json();
  return {
    imageUrl: data.secure_url as string,
    publicId: data.public_id as string,
  };
}

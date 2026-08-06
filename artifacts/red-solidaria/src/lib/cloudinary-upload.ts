export interface UploadedImage {
  imageUrl: string;
  publicId: string;
}

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_SIZE = 8 * 1024 * 1024; // 8 MB

export function validateProofImage(file: File): string | null {
  if (!ALLOWED_TYPES.includes(file.type)) {
    return "Solo se permiten imágenes JPG, PNG o WebP.";
  }
  if (file.size > MAX_SIZE) {
    return "La imagen no puede superar los 8 MB.";
  }
  return null;
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
    throw new Error(
      (body as { message?: string } | null)?.message ||
        "No se pudo iniciar la subida. Intenta más tarde.",
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
    throw new Error("Error al subir la imagen. Intenta más tarde.");
  }
  const data = await upload.json();
  return {
    imageUrl: data.secure_url as string,
    publicId: data.public_id as string,
  };
}

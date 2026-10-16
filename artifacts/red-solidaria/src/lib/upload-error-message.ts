/**
 * Mensajes de error de la subida de imágenes (V17).
 *
 * El fallo que motivó esto: cuando la CSP bloquea `https://api.cloudinary.com`,
 * `fetch` RECHAZA la promesa (`TypeError: Failed to fetch`) en lugar de devolver
 * una respuesta HTTP. El administrador veía ese texto crudo, sin saber qué pasaba.
 * Aquí se traducen las causas REALES —bloqueo del navegador o de la red, firma
 * rechazada, formato o tamaño no permitidos, servicio caído— a mensajes accionables
 * en español.
 *
 * Módulo PURO y SIN DEPENDENCIAS (se compila con esbuild para `node:test`).
 */

export type UploadFailureKind =
  | "network"
  | "signature"
  | "format"
  | "size"
  | "server"
  | "unknown";

export interface UploadFailureInput {
  /** `true` si `fetch` rechazó (CSP/CORS/sin red): NO hubo respuesta HTTP. */
  networkError?: boolean;
  /** Código HTTP de Cloudinary, si hubo respuesta. */
  status?: number | null;
  /** `error.message` que devuelve Cloudinary, si lo hay. */
  cloudinaryMessage?: string | null;
  /** Mensaje del propio servidor al pedir la firma (503, 403…). */
  serverMessage?: string | null;
}

export interface UploadFailure {
  kind: UploadFailureKind;
  message: string;
}

const FORMAT_RE = /format|not allowed|invalid image|unsupported|no es una imagen/i;
const SIZE_RE = /size|too large|maximum|exceeds|demasiado grande/i;

/**
 * Traduce una causa de fallo a `{ kind, message }`. Determinista.
 * El orden importa: primero el bloqueo de red (lo que ve el usuario cuando la CSP
 * corta la petición), luego las restricciones de Cloudinary y por último el estado
 * HTTP.
 */
export function describeUploadFailure(input: UploadFailureInput): UploadFailure {
  const cloud = (input.cloudinaryMessage ?? "").trim();
  const server = (input.serverMessage ?? "").trim();

  if (input.networkError) {
    return {
      kind: "network",
      message:
        "No se pudo contactar con el servicio de imágenes. Comprueba tu conexión e inténtalo de nuevo; si sigue fallando, el navegador podría estar bloqueando el envío (avisa al equipo técnico).",
    };
  }

  if (cloud && FORMAT_RE.test(cloud)) {
    return {
      kind: "format",
      message: "El archivo no es una imagen permitida. Sube una imagen JPG, PNG o WebP.",
    };
  }
  if (cloud && SIZE_RE.test(cloud)) {
    return {
      kind: "size",
      message: "La imagen supera el tamaño máximo permitido (8 MB). Redúcela e inténtalo de nuevo.",
    };
  }

  const status = input.status ?? null;
  if (status === 401 || status === 403) {
    return {
      kind: "signature",
      message:
        server ||
        "No se autorizó la subida. Vuelve a iniciar sesión como administrador e inténtalo de nuevo.",
    };
  }
  if (status !== null && status >= 500) {
    return {
      kind: "server",
      message:
        "El servicio de imágenes no está disponible en este momento. Inténtalo de nuevo en unos minutos.",
    };
  }

  if (server) return { kind: "signature", message: server };
  if (cloud) return { kind: "unknown", message: `No se pudo subir la imagen: ${cloud}` };

  return { kind: "unknown", message: "No se pudo subir la imagen. Inténtalo de nuevo." };
}

/**
 * Validación de imágenes en el navegador (V18).
 *
 * Antes solo se validaba el tipo MIME y el peso; las DIMENSIONES no se miraban, así
 * que se podía subir un logotipo de 3×3 px o un «favicon» rectangular que el
 * navegador recortaba de forma imprevisible. Este módulo decide, con reglas
 * explícitas por tipo de activo, si una imagen sirve.
 *
 * Módulo PURO y SIN DEPENDENCIAS (se compila con esbuild para `node:test`): las
 * dimensiones las lee el componente y se las pasa ya resueltas.
 */

export type ImageValidationCode =
  | "type"
  | "size"
  | "square"
  | "too_small"
  | "too_large";

export interface ImageValidationInput {
  /** `file.type` (p. ej. "image/png"). */
  type: string;
  /** `file.size` en bytes. */
  size: number;
  /** Dimensiones ya leídas; `null` si no se pudieron obtener. */
  width?: number | null;
  height?: number | null;
  allowedTypes?: readonly string[];
  maxBytes?: number;
  /** El activo debe ser cuadrado (favicon). */
  requireSquare?: boolean;
  /** Lado mínimo aceptable (px). 0 = sin mínimo. */
  minSide?: number;
  /** Lado máximo aceptable (px). 0 = sin máximo. */
  maxSide?: number;
}

export interface ImageValidationResult {
  ok: boolean;
  code: ImageValidationCode | null;
  message: string;
}

export const DEFAULT_ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
/** Formatos admitidos para el favicon: sin JPG (pierde transparencia y nitidez). */
export const FAVICON_ALLOWED_IMAGE_TYPES = ["image/png", "image/webp"] as const;
export const DEFAULT_MAX_IMAGE_BYTES = 8 * 1024 * 1024;

const TYPE_LABEL: Record<string, string> = {
  "image/jpeg": "JPG",
  "image/png": "PNG",
  "image/webp": "WebP",
};

function typeLabels(types: readonly string[]): string {
  return types.map((type) => TYPE_LABEL[type] ?? type).join(", ");
}

function megabytes(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1);
}

/**
 * Decide si la imagen es aceptable. Determinista; devuelve SIEMPRE un mensaje
 * comprensible en español, apto para mostrar al administrador.
 */
export function describeImageValidation(input: ImageValidationInput): ImageValidationResult {
  const allowed = input.allowedTypes ?? DEFAULT_ALLOWED_IMAGE_TYPES;
  const maxBytes = input.maxBytes ?? DEFAULT_MAX_IMAGE_BYTES;

  if (!allowed.includes(input.type)) {
    return {
      ok: false,
      code: "type",
      message: `Formato no permitido. Sube una imagen ${typeLabels(allowed)}.`,
    };
  }

  if (input.size > maxBytes) {
    return {
      ok: false,
      code: "size",
      message: `La imagen pesa ${megabytes(input.size)} MB y el máximo es ${megabytes(maxBytes)} MB. Redúcela e inténtalo de nuevo.`,
    };
  }

  const width = input.width ?? null;
  const height = input.height ?? null;
  if (width !== null && height !== null && width > 0 && height > 0) {
    if (input.requireSquare && width !== height) {
      return {
        ok: false,
        code: "square",
        message: `La imagen debe ser CUADRADA (la tuya es ${width}×${height} px).`,
      };
    }
    const minSide = input.minSide ?? 0;
    if (minSide > 0 && Math.min(width, height) < minSide) {
      return {
        ok: false,
        code: "too_small",
        message: `La imagen es demasiado pequeña (${width}×${height} px). El lado mínimo es ${minSide} px.`,
      };
    }
    const maxSide = input.maxSide ?? 0;
    if (maxSide > 0 && Math.max(width, height) > maxSide) {
      return {
        ok: false,
        code: "too_large",
        message: `La imagen es demasiado grande (${width}×${height} px). El lado máximo es ${maxSide} px.`,
      };
    }
  }

  return { ok: true, code: null, message: "Imagen válida." };
}

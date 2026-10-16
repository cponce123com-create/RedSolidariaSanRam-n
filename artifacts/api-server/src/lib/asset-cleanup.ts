/**
 * Limpieza de almacenamiento externo tras un borrado confirmado
 * (Prompt Maestro, Fase 1.3 — Modalidad A).
 *
 * Regla de oro: la limpieza externa NUNCA forma parte de la transacción de
 * base de datos. Primero se confirma el borrado en PostgreSQL; después se
 * programan los borrados en el CDN (Cloudinary) de forma BEST-EFFORT, con
 * reintentos y registro de errores. Si el CDN falla, la base queda consistente
 * y los activos se pueden limpiar manualmente más tarde: un fallo de
 * almacenamiento externo no corrompe la base.
 *
 * `extractCloudinaryPublicId` es una función PURA (testeable sin red): traduce
 * una URL de entrega de Cloudinary a su `public_id`, que es lo que exige la API
 * de destrucción.
 */

import { createUploadSignature } from "./cloudinary";

/**
 * Extrae el `public_id` de una URL de Cloudinary, o `null` si la URL no es de
 * Cloudinary o no tiene el formato esperado.
 *
 * Formatos soportados:
 *   https://res.cloudinary.com/<cloud>/image/upload/<public_id>
 *   https://res.cloudinary.com/<cloud>/image/upload/v123/<public_id>
 *   https://res.cloudinary.com/<cloud>/image/upload/w_500,c_fill/v123/<public_id>
 * La extensión final se elimina (el `public_id` no la incluye).
 */
export function extractCloudinaryPublicId(url: unknown): string | null {
  if (typeof url !== "string" || url.length === 0) return null;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.hostname !== "res.cloudinary.com") return null;

  const segments = parsed.pathname.split("/").filter(Boolean);
  // [cloud, resourceType, deliveryType, ...resto]
  const uploadIndex = segments.indexOf("upload");
  if (uploadIndex === -1) return null;

  let rest = segments.slice(uploadIndex + 1);
  if (rest.length === 0) return null;

  // Descarta segmentos de transformación (p. ej. `w_500,c_fill`, `f_auto`).
  rest = rest.filter((segment) => !isTransformationSegment(segment));

  // Descarta el segmento de versión (`v1234`) si encabeza la ruta.
  if (rest.length > 1 && /^v\d+$/.test(rest[0])) {
    rest = rest.slice(1);
  }

  if (rest.length === 0) return null;
  const last = rest[rest.length - 1].replace(/\.[a-z0-9]+$/i, "");
  if (last.length === 0) return null;
  return [...rest.slice(0, -1), last].join("/");
}

/**
 * Heurística: un segmento de transformación de Cloudinary contiene `_` y, casi
 * siempre, una coma (`w_500,c_fill`). Se evita confundirlo con un nombre de
 * carpeta normal, que no suele llevar coma.
 */
function isTransformationSegment(segment: string): boolean {
  if (!segment.includes("_")) return false;
  return segment.includes(",") || /^(?:[a-z]{1,2}_[a-z0-9]+)+$/i.test(segment);
}

interface CloudinaryCredentials {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
}

function readCredentials(): CloudinaryCredentials | null {
  // `trim()`: un espacio o un salto de línea al pegar las variables en Render
  // invalida la firma (Cloudinary responde 401 «Invalid Signature»).
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME?.trim();
  const apiKey = process.env.CLOUDINARY_API_KEY?.trim();
  const apiSecret = process.env.CLOUDINARY_API_SECRET?.trim();
  if (!cloudName || !apiKey || !apiSecret) return null;
  return { cloudName, apiKey, apiSecret };
}

export interface CleanupLogger {
  warn: (obj: unknown, msg?: string) => void;
  error?: (obj: unknown, msg?: string) => void;
  info?: (obj: unknown, msg?: string) => void;
}

export interface CleanupResult {
  attempted: number;
  deleted: number;
  skipped: number;
  failed: string[];
}

const DEFAULT_ATTEMPTS = 3;

/**
 * Borra en Cloudinary los activos identificados por las URLs dadas. Best-effort:
 * nunca lanza; acumula los fallos en `failed` para que queden en el log.
 */
export async function cleanupCloudinaryAssets(
  urls: readonly string[],
  log: CleanupLogger,
  opts: { attempts?: number } = {},
): Promise<CleanupResult> {
  const publicIds = [...new Set(urls.map(extractCloudinaryPublicId).filter((v): v is string => v !== null))];
  const result = await cleanupCloudinaryAssetsByPublicId(publicIds, log, opts);
  // Las URLs que no son de Cloudinary no se pueden limpiar en el CDN.
  result.skipped += urls.length - publicIds.length;
  return result;
}

/**
 * Igual que `cleanupCloudinaryAssets` pero partiendo de `public_id` YA conocidos
 * (V18). Al reemplazar imágenes de la identidad institucional guardamos el
 * `publicId` en la propia fila, así que no hace falta re-deducirlo de la URL.
 */
export async function cleanupCloudinaryAssetsByPublicId(
  publicIds: readonly string[],
  log: CleanupLogger,
  opts: { attempts?: number } = {},
): Promise<CleanupResult> {
  const credentials = readCredentials();
  const ids = [
    ...new Set(publicIds.filter((id): id is string => typeof id === "string" && id.length > 0)),
  ];

  const result: CleanupResult = {
    attempted: ids.length,
    deleted: 0,
    skipped: 0,
    failed: [],
  };

  if (ids.length === 0) return result;
  if (!credentials) {
    // Sin CDN configurado no hay nada que borrar (los archivos son locales).
    result.skipped += ids.length;
    result.attempted = 0;
    return result;
  }

  const attempts = Math.max(1, opts.attempts ?? DEFAULT_ATTEMPTS);
  for (const publicId of ids) {
    let ok = false;
    let lastError: unknown = null;
    for (let attempt = 1; attempt <= attempts && !ok; attempt += 1) {
      try {
        ok = await destroyAsset(credentials, publicId);
      } catch (err) {
        lastError = err;
      }
    }
    if (ok) {
      result.deleted += 1;
    } else {
      result.failed.push(publicId);
      log.warn(
        { publicId, error: lastError },
        "No se pudo limpiar el activo en Cloudinary (se reintentará manualmente)",
      );
    }
  }

  return result;
}

/** Llama a la API de destrucción de Cloudinary. Devuelve true si borró (o ya no existía). */
async function destroyAsset(
  credentials: CloudinaryCredentials,
  publicId: string,
): Promise<boolean> {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const params: Record<string, string> = { public_id: publicId, timestamp };
  const signature = createUploadSignature(params, credentials.apiSecret);

  const body = new URLSearchParams({
    public_id: publicId,
    timestamp,
    api_key: credentials.apiKey,
    signature,
  });

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${credentials.cloudName}/image/destroy`,
    { method: "POST", body },
  );
  if (!response.ok) return false;
  const payload = (await response.json().catch(() => ({}))) as { result?: string };
  // Cloudinary responde `{ result: "ok" }` al borrar y `{ result: "not found" }`
  // si el activo ya no existe: ambos casos son un éxito idempotente.
  return payload.result === "ok" || payload.result === "not found";
}

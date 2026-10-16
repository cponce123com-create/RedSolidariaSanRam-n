import { sanitizeRichText } from "./rich-text";

/**
 * Lógica pura de la identidad institucional (Fase 3 · V18).
 *
 * Normaliza el contenido que llega del panel, valida reglas de negocio y
 * construye el DTO PÚBLICO con una ALLOWLIST EXPLÍCITA de campos: nada que no
 * esté en `publicIdentityDto` se expone, aunque exista en la fila. El
 * identificador interno de Cloudinary (`publicId`) NUNCA se publica.
 *
 * V18 añade el FAVICON y las utilidades de assets: qué `public_id` referencia el
 * contenido (`collectAssetPublicIds`) y cuáles hay que borrar al reemplazar
 * (`diffRemovedAssets`). Gracias a eso el borrado del archivo anterior se puede
 * DIFERIR hasta confirmar que el reemplazo se guardó y publicó.
 *
 * Módulo PURO y SIN DEPENDENCIAS de red/DB (se compila para `node:test`).
 */

/** Límites de longitud: evitan payloads abusivos dentro del JSONB. */
export const IDENTITY_LIMITS = {
  title: 200,
  subtitle: 400,
  text: 4000,
  html: 20000,
  url: 2048,
  values: 12,
  photos: 12,
} as const;

export interface InstitutionalValue {
  title: string;
  description: string;
}

/** Activo de imagen: URL pública + identificador interno (para poder borrarlo). */
export interface InstitutionalAsset {
  url: string;
  publicId: string | null;
}

export interface InstitutionalIdentityContent {
  logo: InstitutionalAsset;
  cover: {
    desktopUrl: string;
    mobileUrl: string;
    publicId: string | null;
    /** Encuadre de la portada, p. ej. "50% 30%" (object-position). */
    focus: string;
  };
  /** Favicon administrable (cuadrado, PNG/WebP). Vacío = favicon estático. */
  favicon: InstitutionalAsset;
  hero: { title: string; subtitle: string; ctaLabel: string; ctaHref: string };
  story: { title: string; subtitle: string; html: string; photos: string[] };
  mission: string;
  vision: string;
  values: InstitutionalValue[];
}

export interface PublicInstitutionalIdentity extends InstitutionalIdentityContent {
  publishedAt: string | null;
}

export function emptyContent(): InstitutionalIdentityContent {
  return {
    logo: { url: "", publicId: null },
    cover: { desktopUrl: "", mobileUrl: "", publicId: null, focus: "50% 50%" },
    favicon: { url: "", publicId: null },
    hero: { title: "", subtitle: "", ctaLabel: "", ctaHref: "" },
    story: { title: "", subtitle: "", html: "", photos: [] },
    mission: "",
    vision: "",
    values: [],
  };
}

function rec(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function asOptionalString(value: unknown, max: number): string | null {
  const s = asString(value, max);
  return s.length > 0 ? s : null;
}

/** Solo URLs https (Cloudinary sirve por https); rechaza javascript:/data:. */
export function isSafeImageUrl(url: string): boolean {
  return /^https:\/\/[^\s]+$/i.test(url);
}

/** Enlace del CTA: https o ruta interna; nunca javascript:. Cadena vacía = sin CTA. */
export function isSafeLinkUrl(url: string): boolean {
  return url === "" || /^https?:\/\/[^\s]+$/i.test(url) || url.startsWith("/");
}

function asImageUrl(value: unknown): string {
  const s = asString(value, IDENTITY_LIMITS.url);
  return isSafeImageUrl(s) ? s : "";
}

function asImageUrlList(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    const url = asImageUrl(item);
    if (url) out.push(url);
    if (out.length >= max) break;
  }
  return out;
}

function asValues(value: unknown): InstitutionalValue[] {
  if (!Array.isArray(value)) return [];
  const out: InstitutionalValue[] = [];
  for (const item of value) {
    const r = rec(item);
    const title = asString(r.title, IDENTITY_LIMITS.title);
    const description = asString(r.description, IDENTITY_LIMITS.subtitle);
    if (!title && !description) continue;
    out.push({ title, description });
    if (out.length >= IDENTITY_LIMITS.values) break;
  }
  return out;
}

/** Normaliza un activo (logo/favicon): URL https + publicId opcional. */
function asAsset(value: unknown): InstitutionalAsset {
  const r = rec(value);
  return {
    url: asImageUrl(r.url),
    publicId: asOptionalString(r.publicId, IDENTITY_LIMITS.url),
  };
}

/**
 * Normaliza (y sanea) el contenido recibido. NUNCA lanza: descarta lo inválido y
 * devuelve una estructura completa y tipada. La historia pasa por el sanitizador
 * de HTML (anti-XSS) tanto al escribir como al leer.
 */
export function normalizeContent(input: unknown): InstitutionalIdentityContent {
  const root = rec(input);
  const cover = rec(root.cover);
  const hero = rec(root.hero);
  const story = rec(root.story);

  const ctaHref = asString(hero.ctaHref, IDENTITY_LIMITS.url);

  return {
    logo: asAsset(root.logo),
    cover: {
      desktopUrl: asImageUrl(cover.desktopUrl),
      mobileUrl: asImageUrl(cover.mobileUrl),
      publicId: asOptionalString(cover.publicId, IDENTITY_LIMITS.url),
      focus: asString(cover.focus, 40) || "50% 50%",
    },
    favicon: asAsset(root.favicon),
    hero: {
      title: asString(hero.title, IDENTITY_LIMITS.title),
      subtitle: asString(hero.subtitle, IDENTITY_LIMITS.subtitle),
      ctaLabel: asString(hero.ctaLabel, IDENTITY_LIMITS.title),
      ctaHref: isSafeLinkUrl(ctaHref) ? ctaHref : "",
    },
    story: {
      title: asString(story.title, IDENTITY_LIMITS.title),
      subtitle: asString(story.subtitle, IDENTITY_LIMITS.subtitle),
      html: sanitizeRichText(asString(story.html, IDENTITY_LIMITS.html)),
      photos: asImageUrlList(story.photos, IDENTITY_LIMITS.photos),
    },
    mission: asString(root.mission, IDENTITY_LIMITS.text),
    vision: asString(root.vision, IDENTITY_LIMITS.text),
    values: asValues(root.values),
  };
}

/** Errores de negocio (los tipos y longitudes ya se recortan al normalizar). */
export function validateContent(content: InstitutionalIdentityContent): string[] {
  const errors: string[] = [];
  if (content.hero.ctaLabel && !content.hero.ctaHref) {
    errors.push("El botón de llamada a la acción necesita un enlace válido.");
  }
  if (content.hero.ctaHref && !content.hero.ctaLabel) {
    errors.push("El enlace del botón necesita un texto.");
  }
  return errors;
}

/** ¿El contenido está vacío (no hay nada que mostrar al público)? */
export function isContentEmpty(content: InstitutionalIdentityContent): boolean {
  return (
    !content.logo.url &&
    !content.cover.desktopUrl &&
    !content.favicon.url &&
    !content.hero.title &&
    !content.hero.subtitle &&
    !content.story.title &&
    !content.story.html &&
    !content.mission &&
    !content.vision &&
    content.values.length === 0 &&
    content.story.photos.length === 0
  );
}

/**
 * Huella estable del contenido normalizado. Sirve para saber si el borrador tiene
 * CAMBIOS PENDIENTES respecto a lo publicado (comparación exacta, no heurística).
 */
export function contentFingerprint(content: InstitutionalIdentityContent): string {
  return JSON.stringify(content);
}

export function hasPendingChanges(
  draft: InstitutionalIdentityContent,
  published: InstitutionalIdentityContent | null,
): boolean {
  if (!published) return !isContentEmpty(draft);
  return contentFingerprint(draft) !== contentFingerprint(published);
}

/**
 * DTO PÚBLICO (allowlist EXPLÍCITA). Construye el objeto campo a campo: nada que
 * no esté aquí se expone aunque exista en la fila. `publicId` no se publica.
 * Devuelve `null` si no hay nada publicado o el contenido publicado está vacío.
 */
export function publicIdentityDto(
  published: unknown,
  publishedAt: Date | string | null,
): PublicInstitutionalIdentity | null {
  if (published === null || published === undefined) return null;
  const content = normalizeContent(published);
  if (isContentEmpty(content)) return null;

  const iso =
    publishedAt instanceof Date
      ? publishedAt.toISOString()
      : typeof publishedAt === "string"
        ? publishedAt
        : null;

  return {
    logo: { url: content.logo.url, publicId: null },
    cover: {
      desktopUrl: content.cover.desktopUrl,
      mobileUrl: content.cover.mobileUrl,
      publicId: null,
      focus: content.cover.focus,
    },
    favicon: { url: content.favicon.url, publicId: null },
    hero: content.hero,
    story: content.story,
    mission: content.mission,
    vision: content.vision,
    values: content.values,
    publishedAt: iso,
  };
}

/**
 * `true` si el `publicId` pertenece a NUESTRAS carpetas de identidad institucional.
 * Guarda contra el borrado accidental de archivos compartidos en Cloudinary.
 */
export function isOwnedPublicId(publicId: string | null | undefined): boolean {
  return (
    typeof publicId === "string" && publicId.startsWith("institutional-identity/")
  );
}

/**
 * TODOS los `public_id` referenciados por el contenido (logo, portada, favicon y,
 * si se pasa un extractor, las fotos de la historia, que solo guardan la URL).
 */
export function collectAssetPublicIds(
  content: InstitutionalIdentityContent,
  extractFromUrl?: (url: string) => string | null,
): string[] {
  const ids: string[] = [];
  const fromUrl = (url: string) => {
    if (!extractFromUrl || !url) return;
    const id = extractFromUrl(url);
    if (id) ids.push(id);
  };
  // Preferimos el publicId guardado; si falta (p. ej. la portada móvil, que solo
  // guarda URL), lo deducimos de la URL para no dejar el archivo sin limpiar.
  const push = (publicId: string | null, url: string) => {
    if (publicId) ids.push(publicId);
    else fromUrl(url);
  };
  push(content.logo.publicId, content.logo.url);
  push(content.cover.publicId, content.cover.desktopUrl);
  fromUrl(content.cover.mobileUrl);
  push(content.favicon.publicId, content.favicon.url);
  for (const url of content.story.photos) fromUrl(url);
  return [...new Set(ids)];
}

/**
 * `public_id` que hay que BORRAR al confirmar un reemplazo: estaban referenciados
 * por `previous` y ya NO lo están ni en `next` ni en el contenido que sigue vivo
 * (`stillReferenced`, p. ej. lo publicado). Nunca borra algo que aún se usa.
 */
export function diffRemovedAssets(
  previous: InstitutionalIdentityContent,
  next: InstitutionalIdentityContent,
  stillReferenced: InstitutionalIdentityContent | null,
  extractFromUrl?: (url: string) => string | null,
): string[] {
  const keep = new Set([
    ...collectAssetPublicIds(next, extractFromUrl),
    ...(stillReferenced ? collectAssetPublicIds(stillReferenced, extractFromUrl) : []),
  ]);
  return collectAssetPublicIds(previous, extractFromUrl).filter((id) => !keep.has(id));
}

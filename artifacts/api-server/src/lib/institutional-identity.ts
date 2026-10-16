import { sanitizeRichText } from "./rich-text";

/**
 * Lógica pura de la identidad institucional (Fase 3 del Prompt Maestro).
 *
 * Normaliza el contenido que llega del panel, valida reglas de negocio y
 * construye el DTO PÚBLICO con una ALLOWLIST EXPLÍCITA de campos: nada que no
 * esté en `publicIdentityDto` se expone, aunque exista en la fila. El
 * identificador interno de Cloudinary (`publicId`) NUNCA se publica.
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

export interface InstitutionalIdentityContent {
  logo: { url: string; publicId: string | null };
  cover: {
    desktopUrl: string;
    mobileUrl: string;
    publicId: string | null;
    /** Encuadre de la portada, p. ej. "50% 30%" (object-position). */
    focus: string;
  };
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

/**
 * Normaliza (y sanea) el contenido recibido. NUNCA lanza: descarta lo inválido y
 * devuelve una estructura completa y tipada. La historia pasa por el sanitizador
 * de HTML (anti-XSS) tanto al escribir como al leer.
 */
export function normalizeContent(input: unknown): InstitutionalIdentityContent {
  const root = rec(input);
  const logo = rec(root.logo);
  const cover = rec(root.cover);
  const hero = rec(root.hero);
  const story = rec(root.story);

  const ctaHref = asString(hero.ctaHref, IDENTITY_LIMITS.url);

  return {
    logo: {
      url: asImageUrl(logo.url),
      publicId: asOptionalString(logo.publicId, IDENTITY_LIMITS.url),
    },
    cover: {
      desktopUrl: asImageUrl(cover.desktopUrl),
      mobileUrl: asImageUrl(cover.mobileUrl),
      publicId: asOptionalString(cover.publicId, IDENTITY_LIMITS.url),
      focus: asString(cover.focus, 40) || "50% 50%",
    },
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
    hero: content.hero,
    story: content.story,
    mission: content.mission,
    vision: content.vision,
    values: content.values,
    publishedAt: iso,
  };
}

/**
 * `true` si el `publicId` pertenece a NUESTRA carpeta de identidad institucional.
 * Guarda contra el borrado accidental de archivos compartidos en Cloudinary.
 */
export function isOwnedPublicId(publicId: string | null | undefined): boolean {
  return (
    typeof publicId === "string" && publicId.startsWith("institutional-identity/")
  );
}

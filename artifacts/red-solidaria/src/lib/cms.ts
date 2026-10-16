/**
 * Resolución del contenido del CMS en el frontend (Fase 2–5).
 *
 * Principio: el contenido de i18n es el VALOR POR DEFECTO y lo publicado por el CMS
 * solo lo SUPERPONE si existe. Así:
 *   - la web nunca queda vacía ni se rompe si una página no está publicada,
 *   - los datos estáticos NUNCA sobrescriben lo publicado,
 *   - las cifras siguen viniendo de Neon (los bloques `ref*` no tienen números).
 *
 * Módulo PURO y sin dependencias: se compila con esbuild para `node:test`
 * (ver `build-tests.mjs`).
 */

export type Locale = "es" | "en";

export interface CmsBilingual {
  es: string;
  en: string;
}

export interface CmsAssetDto {
  url: string;
  alt: CmsBilingual;
  focus: string;
  ratio: string;
}

export interface PublicCmsBlock {
  id: string;
  type: string;
  order: number;
  enabled: boolean;
  fields: Record<string, unknown>;
}

export interface PublicCmsPage {
  slug: string;
  blocks: PublicCmsBlock[];
  publishedAt: string | null;
}

/** Normaliza el idioma activo del sitio a `es`/`en` (respaldo: `es`). */
export function resolveLocale(locale: string | undefined | null): Locale {
  return locale === "en" ? "en" : "es";
}

function rec(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/**
 * Texto bilingüe → cadena en el idioma activo, con respaldo a `es` si falta la
 * traducción. Entradas no válidas devuelven "".
 */
export function resolveText(value: unknown, locale: Locale): string {
  const r = rec(value);
  const preferred = typeof r[locale] === "string" ? (r[locale] as string) : "";
  if (preferred) return preferred;
  return typeof r.es === "string" ? r.es : "";
}

/** Igual que `resolveText` pero con un valor por defecto de i18n. */
export function resolveTextOr(value: unknown, locale: Locale, fallback: string): string {
  return resolveText(value, locale) || fallback;
}

/** Bloque publicado de una página (o `undefined` si la página no lo tiene). */
export function cmsBlock(page: PublicCmsPage | null | undefined, type: string): PublicCmsBlock | undefined {
  return page?.blocks.find((block) => block.type === type);
}

/** ¿Está activo el bloque? Si no hay CMS, `true` (se usa el contenido por defecto). */
export function isBlockEnabled(page: PublicCmsPage | null | undefined, type: string): boolean {
  const block = cmsBlock(page, type);
  if (!block) return true;
  return block.enabled !== false;
}

/** Campo de texto bilingüe de un bloque, con respaldo de i18n. */
export function cmsText(
  page: PublicCmsPage | null | undefined,
  type: string,
  field: string,
  locale: Locale,
  fallback = "",
): string {
  const block = cmsBlock(page, type);
  if (!block) return fallback;
  return resolveTextOr(block.fields[field], locale, fallback);
}

/** Enlace (https o ruta interna) de un bloque, con respaldo de i18n. */
export function cmsLink(
  page: PublicCmsPage | null | undefined,
  type: string,
  field: string,
  locale: Locale,
  fallback = "",
): string {
  const value = cmsText(page, type, field, locale, "");
  if (!value) return fallback;
  // Defensa en profundidad: nunca se emite un `javascript:` en un href.
  if (!(value.startsWith("/") || /^https?:\/\//i.test(value))) return fallback;
  return value;
}

/** Activo de imagen de un bloque, o `null` si no hay imagen publicada. */
export function cmsAsset(
  page: PublicCmsPage | null | undefined,
  type: string,
  field: string,
): CmsAssetDto | null {
  const block = cmsBlock(page, type);
  if (!block) return null;
  const r = rec(block.fields[field]);
  const url = typeof r.url === "string" ? r.url : "";
  if (!url) return null;
  return {
    url,
    alt: { es: rec(r.alt).es as string ?? "", en: rec(r.alt).en as string ?? "" },
    focus: typeof r.focus === "string" && r.focus ? r.focus : "50% 50%",
    ratio: typeof r.ratio === "string" ? r.ratio : "",
  };
}

/** Texto alternativo de un activo, con respaldo. */
export function cmsAssetAlt(asset: CmsAssetDto | null, locale: Locale, fallback = ""): string {
  if (!asset) return fallback;
  return resolveTextOr(asset.alt, locale, fallback);
}

/** Elementos de una lista de un bloque (vacío si no hay CMS o no hay lista). */
export function cmsItems(
  page: PublicCmsPage | null | undefined,
  type: string,
  field: string,
): Record<string, unknown>[] {
  const block = cmsBlock(page, type);
  if (!block) return [];
  const value = block.fields[field];
  return Array.isArray(value) ? value.map((item) => rec(item)) : [];
}

/**
 * Construye el `srcSet`/`focus` de una imagen administrable con respaldo: si el CMS
 * no define imagen, se usan los valores por defecto (imagen estática + foco centrado).
 */
export interface ResolvedImage {
  src: string;
  alt: string;
  focus: string;
  ratio: string;
  fromCms: boolean;
}

export function resolveImage(
  asset: CmsAssetDto | null,
  locale: Locale,
  fallback: { src: string; alt: string; focus?: string; ratio?: string },
): ResolvedImage {
  if (asset) {
    return {
      src: asset.url,
      alt: cmsAssetAlt(asset, locale, fallback.alt),
      focus: asset.focus || fallback.focus || "50% 50%",
      ratio: asset.ratio || fallback.ratio || "",
      fromCms: true,
    };
  }
  return {
    src: fallback.src,
    alt: fallback.alt,
    focus: fallback.focus ?? "50% 50%",
    ratio: fallback.ratio ?? "",
    fromCms: false,
  };
}

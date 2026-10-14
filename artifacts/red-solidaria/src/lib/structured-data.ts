/**
 * Datos estructurados (JSON-LD) para buscadores — Fase 8, FE-09.
 *
 * Solo se generan datos REALES: el nombre y la descripción salen del idioma
 * activo, la URL del sitio de la configuración pública y el logotipo del propio
 * sitio. No se inventan valoraciones, fechas ni precios.
 *
 * Nota deliberada: el evento ChocoFest 2026 **no** publica datos estructurados
 * de tipo `Event` porque sus fechas oficiales todavía no están definidas; un
 * `Event` sin `startDate` no aporta resultados enriquecidos y poner una fecha
 * inventada sería peor que no poner nada.
 *
 * Funciones PURAS y testeables (sin React ni red).
 */

/** URL pública por defecto (la del despliegue actual). */
export const DEFAULT_PUBLIC_URL = "https://redsolidariasanramon.org";

/** Logotipo del sitio, relativo a la raíz. */
export const DEFAULT_LOGO_PATH = "/images/logo.webp";

/**
 * Normaliza la URL pública: quita barras finales y usa la de por defecto si no
 * hay valor utilizable. Evita que `https://sitio.org/` genere dobles barras.
 */
export function resolvePublicBaseUrl(value: unknown): string {
  if (typeof value !== "string") return DEFAULT_PUBLIC_URL;
  const trimmed = value.trim().replace(/\/+$/, "");
  return trimmed || DEFAULT_PUBLIC_URL;
}

/** Convierte una ruta del sitio en URL absoluta (deja intactas las absolutas). */
export function absoluteUrl(baseUrl: string, path: string | undefined | null): string {
  const base = resolvePublicBaseUrl(baseUrl);
  if (typeof path !== "string" || !path.trim()) return base;
  const value = path.trim();
  if (/^https?:\/\//i.test(value)) return value;
  return `${base}${value.startsWith("/") ? value : `/${value}`}`;
}

export interface SiteJsonLdInput {
  siteName: string;
  description: string;
  /** Ruta o URL del logotipo; por defecto el del sitio. */
  logoUrl?: string;
  /** URL pública absoluta; por defecto la del despliegue actual. */
  baseUrl?: string;
}

/** Organización (ONG) dueña del sitio. */
export function buildOrganizationJsonLd({
  siteName,
  description,
  logoUrl = DEFAULT_LOGO_PATH,
  baseUrl = DEFAULT_PUBLIC_URL,
}: SiteJsonLdInput): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "NGO",
    name: siteName,
    url: resolvePublicBaseUrl(baseUrl),
    logo: absoluteUrl(baseUrl, logoUrl),
    description,
  };
}

/** Sitio web y su idioma por defecto. */
export function buildWebsiteJsonLd({
  siteName,
  description,
  baseUrl = DEFAULT_PUBLIC_URL,
}: SiteJsonLdInput): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: siteName,
    url: resolvePublicBaseUrl(baseUrl),
    description,
    inLanguage: "es",
  };
}

/** Los dos bloques de la portada, en el orden en que se publican. */
export function buildSiteJsonLd(input: SiteJsonLdInput): Record<string, unknown>[] {
  return [buildOrganizationJsonLd(input), buildWebsiteJsonLd(input)];
}

/**
 * Serializa para el contenido de un `<script type="application/ld+json">`.
 *
 * Escapa `<`, `>` y `&` para que un texto que contenga `</script>` (por ejemplo
 * un título) no pueda cerrar la etiqueta y sacar contenido del contexto de
 * datos, y U+2028/U+2029, que son válidos en JSON pero no en JavaScript antiguo.
 * El resultado sigue siendo JSON válido: `JSON.parse` devuelve el mismo objeto.
 */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data ?? null)
    .replace(/</g, String.raw`\u003c`)
    .replace(/>/g, String.raw`\u003e`)
    .replace(/&/g, String.raw`\u0026`)
    .replace(/\u2028/g, String.raw`\u2028`)
    .replace(/\u2029/g, String.raw`\u2029`);
}

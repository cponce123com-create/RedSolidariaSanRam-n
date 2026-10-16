import { sanitizeRichText } from "./rich-text";

/**
 * Lógica PURA del CMS institucional (Fase 2–3).
 *
 * Reglas de diseño (las tres son requisitos del CMS):
 *
 *  1. ALLOWLIST TOTAL. Cada página tiene un esquema declarativo (`PAGE_SPECS`) y
 *     cada bloque un conjunto cerrado de campos (`BLOCK_SPECS`). `normalizePage`
 *     DESCARTA cualquier campo o bloque que no esté en el esquema: el panel no
 *     puede inyectar campos arbitrarios, HTML suelto ni componentes dinámicos.
 *
 *  2. LAS CIFRAS NO SON EDITABLES. Los bloques `ref*` (estadísticas, campañas,
 *     adopciones, casos urgentes) NO tienen ningún campo numérico en su esquema:
 *     solo encabezado, subtítulo y visibilidad. Cualquier número que envíe el
 *     cliente se descarta al normalizar; los valores reales siempre se calculan
 *     desde Neon en el frontend. Así el CMS no puede «falsificar» el recaudado.
 *
 *  3. BILINGÜE CON RESPALDO. Los campos de texto son `{ es, en }`; el frontend
 *     resuelve el idioma activo y cae a `es` si falta la traducción.
 *
 * El módulo NO tiene dependencias de red ni de base de datos (se compila con
 * esbuild para `node:test`). El saneado de HTML vive en `rich-text.ts` y se aplica
 * tanto al escribir como al leer (defensa en profundidad).
 */

// ─── Límites (evitan payloads abusivos dentro del JSONB) ─────────────────────
export const CMS_LIMITS = {
  title: 200,
  text: 4000,
  html: 20000,
  url: 2048,
  short: 120,
  list: 24,
} as const;

// ─── Tipos ───────────────────────────────────────────────────────────────────
export interface CmsBilingual {
  es: string;
  en: string;
}

export interface CmsAsset {
  url: string;
  /** Identificador interno de Cloudinary. NUNCA se publica. */
  publicId: string | null;
  alt: CmsBilingual;
  /** Encuadre (object-position), p. ej. "50% 30%". */
  focus: string;
  /** Proporción sugerida e informativa, p. ej. "4/3" o "16/9". */
  ratio: string;
}

export interface CmsBlock {
  /** Igual al tipo: como máximo hay UN bloque de cada tipo por página. */
  id: string;
  type: string;
  enabled: boolean;
  order: number;
  fields: Record<string, unknown>;
}

export interface CmsPageContent {
  blocks: CmsBlock[];
}

export interface PublicCmsBlock {
  id: string;
  type: string;
  order: number;
  /** `false` = el bloque está desactivado y el frontend debe OCULTAR la sección. */
  enabled: boolean;
  fields: Record<string, unknown>;
}

export interface PublicCmsPage {
  slug: string;
  blocks: PublicCmsBlock[];
  publishedAt: string | null;
}

// ─── Especificación de campos ────────────────────────────────────────────────
type FieldSpec =
  | { kind: "text"; max: number }
  | { kind: "richText"; max: number }
  | { kind: "url" }
  | { kind: "image" }
  | { kind: "enum"; values: readonly string[] }
  | { kind: "list"; max: number; fields: Record<string, FieldSpec> };

interface BlockSpec {
  label: string;
  /**
   * `true` = bloque de REFERENCIA: muestra datos calculados desde Neon y solo
   * admite encabezado/subtítulo/visibilidad. Nunca cifras editables.
   */
  reference?: boolean;
  fields: Record<string, FieldSpec>;
}

const t = (max: number = CMS_LIMITS.text): FieldSpec => ({ kind: "text", max });
const rich = (): FieldSpec => ({ kind: "richText", max: CMS_LIMITS.html });
const url = (): FieldSpec => ({ kind: "url" });
const image = (): FieldSpec => ({ kind: "image" });
const enm = (...values: string[]): FieldSpec => ({ kind: "enum", values });
const list = (fields: Record<string, FieldSpec>, max: number = CMS_LIMITS.list): FieldSpec => ({
  kind: "list",
  max,
  fields,
});

// ─── Bloques disponibles ─────────────────────────────────────────────────────
const BLOCK_SPECS: Record<string, BlockSpec> = {
  hero: {
    label: "Encabezado principal",
    fields: {
      eyebrow: t(CMS_LIMITS.short),
      title: t(CMS_LIMITS.title),
      titleAccent: t(CMS_LIMITS.title),
      subtitle: t(),
      ctaLabel: t(CMS_LIMITS.title),
      ctaHref: url(),
      ctaLabel2: t(CMS_LIMITS.title),
      ctaHref2: url(),
      image: image(),
    },
  },
  help: {
    label: "Formas de ayudar",
    fields: {
      heading: t(CMS_LIMITS.title),
      subtitle: t(),
      items: list({ title: t(CMS_LIMITS.title), description: t(), href: url() }, 8),
    },
  },
  richText: {
    label: "Texto enriquecido",
    fields: {
      heading: t(CMS_LIMITS.title),
      html: rich(),
    },
  },
  imageText: {
    label: "Imagen + texto",
    fields: {
      heading: t(CMS_LIMITS.title),
      html: rich(),
      image: image(),
      imagePosition: enm("left", "right"),
      ctaLabel: t(CMS_LIMITS.title),
      ctaHref: url(),
    },
  },
  cards: {
    label: "Tarjetas",
    fields: {
      heading: t(CMS_LIMITS.title),
      subtitle: t(),
      items: list({ title: t(CMS_LIMITS.title), description: t() }, 12),
    },
  },
  cta: {
    label: "Llamada a la acción",
    fields: {
      heading: t(CMS_LIMITS.title),
      subtitle: t(),
      ctaLabel: t(CMS_LIMITS.title),
      ctaHref: url(),
      ctaLabel2: t(CMS_LIMITS.title),
      ctaHref2: url(),
    },
  },
  // ── Bloques de REFERENCIA: sin cifras editables (se calculan desde Neon) ──
  refStats: {
    label: "Cifras de impacto (calculadas)",
    reference: true,
    fields: { heading: t(CMS_LIMITS.title), subtitle: t() },
  },
  refCampaigns: {
    label: "Campañas (calculadas)",
    reference: true,
    fields: { heading: t(CMS_LIMITS.title), subtitle: t() },
  },
  refUrgent: {
    label: "Casos urgentes (calculados)",
    reference: true,
    fields: { heading: t(CMS_LIMITS.title), subtitle: t() },
  },
  refAdoptions: {
    label: "Mascotas en adopción (calculadas)",
    reference: true,
    fields: { heading: t(CMS_LIMITS.title), subtitle: t() },
  },
  // ── Menú y pie de página ─────────────────────────────────────────────────
  nav: {
    label: "Menú principal",
    fields: {
      items: list({ label: t(CMS_LIMITS.title), href: url() }, 12),
    },
  },
  footer: {
    label: "Pie de página",
    fields: {
      tagline: t(),
      address: t(CMS_LIMITS.short),
      transparencyText: t(),
      ctaLabel: t(CMS_LIMITS.title),
      ctaHref: url(),
      links: list({ label: t(CMS_LIMITS.title), href: url() }, 12),
    },
  },
};

// ─── Páginas del CMS ─────────────────────────────────────────────────────────
interface PageSpec {
  title: string;
  /** `true` = ya consumida por el frontend público (el resto se irá cableando). */
  wired: boolean;
  blocks: string[];
}

export const PAGE_SPECS: Record<string, PageSpec> = {
  inicio: {
    title: "Página de inicio",
    wired: true,
    blocks: ["hero", "help", "refCampaigns", "refUrgent", "refStats", "imageText", "refAdoptions", "cta"],
  },
  historia: {
    title: "Nuestra historia",
    wired: true,
    blocks: ["hero", "imageText", "richText", "cards", "cta"],
  },
  menu: {
    title: "Menú y pie de página",
    wired: true,
    blocks: ["nav", "footer"],
  },
  // Resto de páginas: el ENCABEZADO (bloque `hero`) ya es administrable y la web lo
  // consume. El esquema declara SOLO los bloques que tienen efecto, para que el editor
  // no muestre controles que no cambian nada; se irán añadiendo (texto, CTA…) a medida
  // que cada página los renderice.
  campanas: { title: "Campañas y actividades", wired: true, blocks: ["hero"] },
  donaciones: { title: "Donaciones", wired: true, blocks: ["hero"] },
  voluntariado: { title: "Voluntariado", wired: true, blocks: ["hero"] },
  "necesito-ayuda": { title: "Necesito ayuda", wired: true, blocks: ["hero"] },
  adopciones: { title: "Adopciones", wired: true, blocks: ["hero"] },
  transparencia: { title: "Transparencia", wired: true, blocks: ["hero"] },
  noticias: { title: "Noticias y testimonios", wired: true, blocks: ["hero"] },
  contacto: { title: "Contacto", wired: true, blocks: ["hero"] },
};

export const CMS_PAGE_SLUGS: string[] = Object.keys(PAGE_SPECS);

export function isCmsPageSlug(value: unknown): value is string {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(PAGE_SPECS, value);
}

export function cmsPageTitle(slug: string): string {
  return PAGE_SPECS[slug]?.title ?? slug;
}

export function cmsPageIsWired(slug: string): boolean {
  return PAGE_SPECS[slug]?.wired === true;
}

/** Descriptor de un campo, para que el editor del panel sepa qué input pintar. */
export interface CmsFieldSchema {
  name: string;
  kind: "text" | "richText" | "url" | "image" | "enum" | "list";
  values?: string[];
  fields?: CmsFieldSchema[];
}

export interface CmsBlockSchema {
  type: string;
  label: string;
  reference: boolean;
  fields: CmsFieldSchema[];
}

function fieldSchema(name: string, spec: FieldSpec): CmsFieldSchema {
  switch (spec.kind) {
    case "enum":
      return { name, kind: "enum", values: [...spec.values] };
    case "list":
      return {
        name,
        kind: "list",
        fields: Object.entries(spec.fields).map(([key, field]) => fieldSchema(key, field)),
      };
    default:
      return { name, kind: spec.kind };
  }
}

/**
 * Esquema de los bloques de una página (para el editor), con su etiqueta, si es un
 * bloque de REFERENCIA (datos calculados, sin cifras editables) y el tipo de cada
 * campo. El panel renderiza los inputs a partir de esto: la ALLOWLIST del servidor es
 * también la fuente de verdad de la interfaz.
 */
export function cmsPageBlockSchema(slug: string): CmsBlockSchema[] {
  const spec = PAGE_SPECS[slug];
  if (!spec) return [];
  return spec.blocks
    .filter((type) => Boolean(BLOCK_SPECS[type]))
    .map((type) => ({
      type,
      label: BLOCK_SPECS[type].label,
      reference: BLOCK_SPECS[type].reference === true,
      fields: Object.entries(BLOCK_SPECS[type].fields).map(([name, field]) =>
        fieldSchema(name, field),
      ),
    }));
}

// ─── Helpers de normalización ────────────────────────────────────────────────
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

/** Solo URLs https: rechaza `javascript:`, `data:` y contenido embebido. */
export function isSafeImageUrl(value: string): boolean {
  return /^https:\/\/[^\s]+$/i.test(value);
}

/** Enlace: https o ruta interna; nunca `javascript:`. Cadena vacía = sin enlace. */
export function isSafeLinkUrl(value: string): boolean {
  return value === "" || /^https?:\/\/[^\s]+$/i.test(value) || value.startsWith("/");
}

function asBilingual(value: unknown, max: number): CmsBilingual {
  const r = rec(value);
  return { es: asString(r.es, max), en: asString(r.en, max) };
}

function asRichText(value: unknown): CmsBilingual {
  const r = rec(value);
  return {
    es: sanitizeRichText(asString(r.es, CMS_LIMITS.html)),
    en: sanitizeRichText(asString(r.en, CMS_LIMITS.html)),
  };
}

function asLink(value: unknown): CmsBilingual {
  const b = asBilingual(value, CMS_LIMITS.url);
  return {
    es: isSafeLinkUrl(b.es) ? b.es : "",
    en: isSafeLinkUrl(b.en) ? b.en : "",
  };
}

function asAsset(value: unknown): CmsAsset {
  const r = rec(value);
  const u = asString(r.url, CMS_LIMITS.url);
  const safe = isSafeImageUrl(u) ? u : "";
  return {
    url: safe,
    // Sin URL válida no hay publicId: evita referencias a activos inexistentes.
    publicId: safe ? asOptionalString(r.publicId, CMS_LIMITS.url) : null,
    alt: asBilingual(r.alt, CMS_LIMITS.title),
    focus: asString(r.focus, 40) || "50% 50%",
    ratio: asString(r.ratio, 12),
  };
}

function normalizeValue(spec: FieldSpec, value: unknown): unknown {
  switch (spec.kind) {
    case "text":
      return asBilingual(value, spec.max);
    case "richText":
      return asRichText(value);
    case "url":
      return asLink(value);
    case "image":
      return asAsset(value);
    case "enum": {
      const raw = asString(value, 40);
      // Un enum sin valor explícito queda VACÍO (no en su primer valor): así un
      // bloque sin datos no cuenta como «con contenido» (y el frontend aplica su
      // propio valor por defecto). Solo se aceptan valores de la allowlist.
      return spec.values.includes(raw) ? raw : "";
    }
    case "list": {
      if (!Array.isArray(value)) return [];
      const out: Record<string, unknown>[] = [];
      for (const item of value) {
        const r = rec(item);
        const normalized: Record<string, unknown> = {};
        for (const [key, fieldSpec] of Object.entries(spec.fields)) {
          normalized[key] = normalizeValue(fieldSpec, r[key]);
        }
        out.push(normalized);
        if (out.length >= spec.max) break;
      }
      return out;
    }
    default:
      return null;
  }
}

function normalizeFields(
  spec: Record<string, FieldSpec>,
  raw: unknown,
): Record<string, unknown> {
  const r = rec(raw);
  const out: Record<string, unknown> = {};
  // ALLOWLIST: solo las claves del esquema; cualquier otra se descarta.
  for (const [key, fieldSpec] of Object.entries(spec)) {
    out[key] = normalizeValue(fieldSpec, r[key]);
  }
  return out;
}

function normalizeBlock(type: string, raw: unknown, order: number): CmsBlock {
  const spec = BLOCK_SPECS[type];
  const r = rec(raw);
  return {
    id: type,
    type,
    enabled: r.enabled !== false,
    order,
    fields: normalizeFields(spec.fields, r.fields),
  };
}

/**
 * Normaliza el contenido de una página. Devuelve `null` si el slug no pertenece
 * al CMS. NUNCA lanza: descarta lo inválido y materializa TODOS los bloques del
 * esquema (los que no vengan en la entrada se crean vacíos y en su orden natural),
 * de modo que el editor siempre muestra la página completa.
 */
export function normalizePage(slug: string, input: unknown): CmsPageContent | null {
  const spec = PAGE_SPECS[slug];
  if (!spec) return null;

  const root = rec(input);
  const rawBlocks = Array.isArray(root.blocks) ? root.blocks : [];

  const provided = new Map<string, unknown>();
  const orderedTypes: string[] = [];
  for (const raw of rawBlocks) {
    const type = asString(rec(raw).type, 60);
    if (!spec.blocks.includes(type) || provided.has(type)) continue;
    provided.set(type, raw);
    orderedTypes.push(type);
  }
  for (const type of spec.blocks) {
    if (!provided.has(type)) orderedTypes.push(type);
  }

  return {
    blocks: orderedTypes.map((type, index) => normalizeBlock(type, provided.get(type), index)),
  };
}

/** Contenido vacío de una página (todos los bloques del esquema, sin datos). */
export function emptyPage(slug: string): CmsPageContent {
  return normalizePage(slug, {}) ?? { blocks: [] };
}

// ─── Validación de negocio ───────────────────────────────────────────────────
/**
 * Regla de enlaces: un texto de botón (`*Label`) exige su enlace (`*Href`) y
 * viceversa. Se aplica de forma genérica a cualquier par dentro de un bloque
 * (incluidas las listas), así no hay que repetir la regla por bloque.
 */
function validateLinkPairs(fields: Record<string, unknown>, path: string, errors: string[]): void {
  for (const [key, value] of Object.entries(fields)) {
    if (!key.endsWith("Label")) continue;
    const hrefKey = `${key.slice(0, -"Label".length)}Href`;
    if (!(hrefKey in fields)) continue;
    const label = value as CmsBilingual;
    const href = fields[hrefKey] as CmsBilingual;
    const hasLabel = Boolean(label?.es || label?.en);
    const hasHref = Boolean(href?.es || href?.en);
    if (hasLabel && !hasHref) errors.push(`El botón «${path}.${key}» necesita un enlace.`);
    if (hasHref && !hasLabel) errors.push(`El enlace «${path}.${hrefKey}» necesita un texto.`);
  }
}

function walkFields(
  spec: Record<string, FieldSpec>,
  fields: Record<string, unknown>,
  path: string,
  errors: string[],
): void {
  validateLinkPairs(fields, path, errors);
  for (const [key, fieldSpec] of Object.entries(spec)) {
    if (fieldSpec.kind !== "list") continue;
    const items = fields[key];
    if (!Array.isArray(items)) continue;
    items.forEach((item, index) => {
      walkFields(fieldSpec.fields, rec(item), `${path}.${key}[${index}]`, errors);
    });
  }
}

export function validatePage(content: CmsPageContent): string[] {
  const errors: string[] = [];
  for (const block of content.blocks) {
    const spec = BLOCK_SPECS[block.type];
    if (!spec) continue;
    walkFields(spec.fields, block.fields, spec.label, errors);
  }
  return errors;
}

// ─── ¿Tiene contenido? ───────────────────────────────────────────────────────
function valueHasContent(value: unknown): boolean {
  if (typeof value === "string") return value.length > 0;
  if (Array.isArray(value)) return value.some((item) => valueHasContent(item));
  if (value && typeof value === "object") {
    const r = value as Record<string, unknown>;
    // Un activo cuenta solo si tiene URL.
    if ("url" in r && typeof r.url === "string") return r.url.length > 0;
    return Object.values(r).some((item) => valueHasContent(item));
  }
  return false;
}

export function blockHasContent(block: CmsBlock): boolean {
  return Object.values(block.fields).some((value) => valueHasContent(value));
}

export function isPageEmpty(content: CmsPageContent): boolean {
  return !content.blocks.some((block) => blockHasContent(block));
}

export function pageFingerprint(content: CmsPageContent): string {
  return JSON.stringify(content);
}

export function hasPendingChanges(
  draft: CmsPageContent,
  published: CmsPageContent | null,
): boolean {
  if (!published) return !isPageEmpty(draft);
  return pageFingerprint(draft) !== pageFingerprint(published);
}

// ─── DTO público (allowlist explícita, sin publicId) ─────────────────────────
function publicValue(spec: FieldSpec, value: unknown): unknown {
  switch (spec.kind) {
    case "text":
    case "richText": {
      const b = value as CmsBilingual;
      return { es: b?.es ?? "", en: b?.en ?? "" };
    }
    case "url": {
      const b = value as CmsBilingual;
      return { es: b?.es ?? "", en: b?.en ?? "" };
    }
    case "image": {
      const a = value as CmsAsset;
      // El `publicId` NO se publica: es un identificador interno.
      return { url: a?.url ?? "", alt: a?.alt ?? { es: "", en: "" }, focus: a?.focus ?? "50% 50%", ratio: a?.ratio ?? "" };
    }
    case "enum":
      return typeof value === "string" ? value : "";
    case "list": {
      if (!Array.isArray(value)) return [];
      return value.map((item) => {
        const r = rec(item);
        const out: Record<string, unknown> = {};
        for (const [key, fieldSpec] of Object.entries(spec.fields)) {
          out[key] = publicValue(fieldSpec, r[key]);
        }
        return out;
      });
    }
    default:
      return null;
  }
}

function publicFields(spec: Record<string, FieldSpec>, fields: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const [key, fieldSpec] of Object.entries(spec)) {
    out[key] = publicValue(fieldSpec, fields[key]);
  }
  return out;
}

/**
 * DTO PÚBLICO de una página. Devuelve `null` cuando no hay nada publicado o
 * cuando ningún bloque habilitado tiene contenido: en ese caso el frontend usa su
 * contenido por defecto (i18n) y la web NUNCA se rompe ni queda vacía.
 */
export function publicPageDto(
  slug: string,
  published: unknown,
  publishedAt: Date | string | null,
): PublicCmsPage | null {
  if (published === null || published === undefined) return null;
  const content = normalizePage(slug, published);
  if (!content || isPageEmpty(content)) return null;

  // Se envían TODOS los bloques con su bandera `enabled`. Es lo que permite distinguir
  // tres situaciones en el frontend: bloque DESACTIVADO (se oculta), bloque ACTIVO pero
  // VACÍO (se usa el contenido por defecto) y bloque ACTIVO CON CONTENIDO (se usa el CMS).
  const blocks = content.blocks.map((block) => ({
    id: block.id,
    type: block.type,
    order: block.order,
    enabled: block.enabled,
    fields: publicFields(BLOCK_SPECS[block.type].fields, block.fields),
  }));

  const iso =
    publishedAt instanceof Date
      ? publishedAt.toISOString()
      : typeof publishedAt === "string"
        ? publishedAt
        : null;

  return { slug, blocks, publishedAt: iso };
}

// ─── Gestión de activos (anti-huérfanos) ─────────────────────────────────────
/** `true` si el `publicId` es de NUESTRA carpeta del CMS (`cms/...`). */
export function isOwnedCmsPublicId(publicId: string | null | undefined): boolean {
  return typeof publicId === "string" && publicId.startsWith("cms/");
}

/** Recorre el contenido normalizado y reúne todos los `publicId` referenciados. */
export function collectAssetPublicIds(content: CmsPageContent | null): string[] {
  if (!content) return [];
  const ids: string[] = [];
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const item of value) walk(item);
      return;
    }
    if (value && typeof value === "object") {
      const r = value as Record<string, unknown>;
      if (typeof r.publicId === "string" && r.publicId.length > 0) ids.push(r.publicId);
      for (const item of Object.values(r)) walk(item);
    }
  };
  walk(content.blocks);
  return [...new Set(ids)];
}

/**
 * `public_id` que hay que BORRAR al confirmar un cambio: estaban referenciados por
 * `previous` y ya NO lo están ni en `next` ni en el contenido que sigue vivo
 * (`stillReferenced`, p. ej. lo publicado). Nunca borra algo que aún se usa.
 */
export function diffRemovedAssets(
  previous: CmsPageContent | null,
  next: CmsPageContent | null,
  stillReferenced: CmsPageContent | null,
): string[] {
  const keep = new Set([
    ...collectAssetPublicIds(next),
    ...collectAssetPublicIds(stillReferenced),
  ]);
  return collectAssetPublicIds(previous).filter((id) => !keep.has(id));
}

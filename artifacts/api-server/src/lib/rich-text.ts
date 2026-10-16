/**
 * Sanitizador de texto enriquecido (Fase 3/5 del Prompt Maestro).
 *
 * «Nuestra historia» se edita con un editor enriquecido que produce HTML, y ese
 * HTML se guarda y se muestra en la web pública. Sin saneado, el campo sería un
 * XSS almacenado: cualquiera con acceso al editor podría inyectar scripts que se
 * ejecutarían en el navegador de los visitantes.
 *
 * Política: ALLOWLIST estricta. Solo se conservan las etiquetas y atributos
 * necesarios para dar formato; todo lo demás se elimina. Es un módulo PURO y SIN
 * DEPENDENCIAS (se compila con esbuild para `node:test`) y se aplica DOS VECES:
 * al escribir (PUT/publicar) y al leer (DTO público), como defensa en profundidad.
 */

const ALLOWED_TAGS = new Set([
  "p",
  "br",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "h2",
  "h3",
  "ul",
  "ol",
  "li",
  "a",
  "blockquote",
]);

const VOID_TAGS = new Set(["br"]);

/** Atributos permitidos por etiqueta (nada de `on*`, `style` ni `class`). */
const ALLOWED_ATTRS: Record<string, string[]> = { a: ["href"] };

/** Protocolos aceptados en `href`. Bloquea `javascript:` y `data:`. */
const SAFE_HREF = /^(https?:\/\/|mailto:|\/)/i;

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function sanitizeAttributes(tag: string, rawAttrs: string): string {
  const allowed = ALLOWED_ATTRS[tag];
  if (!allowed || allowed.length === 0) return "";

  const parts: string[] = [];
  const attrRe = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
  let match: RegExpExecArray | null;
  while ((match = attrRe.exec(rawAttrs)) !== null) {
    const name = match[1].toLowerCase();
    if (!allowed.includes(name)) continue;
    const value = (match[3] ?? match[4] ?? match[5] ?? "").trim();
    if (name === "href" && !SAFE_HREF.test(value)) continue;
    parts.push(`${name}="${escapeAttr(value)}"`);
  }

  // Los enlaces abren en pestaña nueva sin exponer la ventana de origen.
  if (tag === "a" && parts.length > 0) parts.push('rel="noopener noreferrer"');

  return parts.length > 0 ? ` ${parts.join(" ")}` : "";
}

/**
 * Devuelve HTML seguro a partir de una cadena arbitraria. Si la entrada no es
 * una cadena, devuelve "". Nunca lanza.
 */
export function sanitizeRichText(html: unknown): string {
  if (typeof html !== "string" || html.length === 0) return "";

  // Etiquetas que se eliminan CON su contenido (no basta con quitar la etiqueta).
  // Se usa una alternativa explícita, sin retroreferencia, para poder escribirlo
  // como literal de expresión regular.
  const dangerousBlock =
    /<\s*(?:script|style|iframe|object|embed|template|noscript|svg|math|form)\b[^>]*>[\s\S]*?<\s*\/\s*(?:script|style|iframe|object|embed|template|noscript|svg|math|form)\s*>/gi;
  const dangerousTag =
    /<\s*\/?\s*(?:script|style|iframe|object|embed|template|noscript|svg|math|form)\b[^>]*>/gi;

  let out = html;

  // 1) Bloques peligrosos completos (contenido incluido) y etiquetas sueltas.
  out = out.replace(dangerousBlock, "");
  out = out.replace(dangerousTag, "");

  // 2) Comentarios HTML.
  out = out.replace(/<!--[\s\S]*?-->/g, "");

  // 3) El resto de etiquetas: se conservan solo las de la allowlist.
  out = out.replace(
    /<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g,
    (full: string, rawTag: string, rawAttrs: string) => {
      const tag = rawTag.toLowerCase();
      if (!ALLOWED_TAGS.has(tag)) return "";
      if (VOID_TAGS.has(tag)) return `<${tag}>`;
      if (full.startsWith("</")) return `</${tag}>`;
      return `<${tag}${sanitizeAttributes(tag, rawAttrs)}>`;
    },
  );

  // 4) Defensa extra: cualquier `<` que no inicie una etiqueta permitida (p. ej.
  //    una etiqueta mal formada sin `>`) se escapa para que no se interprete.
  out = out.replace(
    /<(?!\/?(?:p|br|strong|b|em|i|u|h2|h3|ul|ol|li|a|blockquote)(?:\s|>|\/))/gi,
    "&lt;",
  );

  return out.trim();
}

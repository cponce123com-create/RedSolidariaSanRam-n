import { createHash } from "node:crypto";
import fs from "node:fs";
import { logger } from "./logger";

/**
 * Directivas CSP para la SPA.
 *
 * En producción NO se usa 'unsafe-inline' en scriptSrc/scriptSrcAttr:
 * - Los bundles de Vite son externos (cubiertos por 'self').
 * - El único script inline del index.html (anti-FOUC del tema + swap de
 *   fuentes) se cubre con su hash SHA-256, calculado en el arranque desde el
 *   propio index.html servido: si alguien edita el script, el hash se
 *   recalcula en el siguiente deploy (el HTML es estático, no hace falta nonce
 *   por petición).
 * - scriptSrcAttr 'none': la SPA no usa atributos on* — los eventos sintéticos
 *   de React usan delegación (addEventListener) y Leaflet idem; el swap de
 *   fuentes se hace con addEventListener en el script inline. Cualquier
 *   librería futura que cree handlers inline vía setAttribute/innerHTML deberá
 *   convertirse a addEventListener.
 *
 * En desarrollo se mantiene 'unsafe-inline'/'unsafe-eval' (Vite HMR y el
 * preámbulo de React Refresh lo requieren).
 */

export interface CspOptions {
  isDev: boolean;
  /** Ruta al index.html servido en producción (se leen los scripts inline para hashearlos). */
  indexHtmlPath?: string;
}

/** Devuelve el contenido de los <script> inline EJECUTABLES (sin src y sin JSON-LD). */
export function extractInlineExecutableScripts(html: string): string[] {
  const scripts: string[] = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    const attrs = match[1] ?? "";
    const content = match[2] ?? "";
    const hasSrc = /\bsrc\s*=/.test(attrs);
    const isJsonLd = /\btype\s*=\s*["']application\/ld\+json["']/i.test(attrs);
    if (!hasSrc && !isJsonLd) scripts.push(content);
  }
  return scripts;
}

export function sha256Base64(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("base64");
}

export function buildCspDirectives({ isDev, indexHtmlPath }: CspOptions): Record<string, string[]> {
  let inlineScriptHashes: string[] = [];
  if (!isDev && indexHtmlPath) {
    try {
      const html = fs.readFileSync(indexHtmlPath, "utf8");
      inlineScriptHashes = extractInlineExecutableScripts(html).map(
        (c) => `'sha256-${sha256Base64(c)}'`,
      );
      if (inlineScriptHashes.length === 0) {
        logger.warn({ indexHtmlPath }, "CSP: no se encontraron scripts inline en index.html");
      }
    } catch (err) {
      logger.error({ err, indexHtmlPath }, "CSP: no se pudo leer index.html para calcular hashes");
    }
  }

  return {
    defaultSrc: ["'self'"],
    scriptSrc: isDev
      ? ["'self'", "'unsafe-inline'", "'unsafe-eval'"]
      : ["'self'", ...inlineScriptHashes],
    // Sin atributos on* en producción: React usa delegación de eventos y
    // Leaflet addEventListener; el swap de fuentes usa addEventListener.
    scriptSrcAttr: isDev ? ["'unsafe-inline'"] : ["'none'"],
    styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
    fontSrc: ["'self'", "https://fonts.gstatic.com"],
    imgSrc: ["'self'", "data:", "https:", "blob:"],
    connectSrc: ["'self'", process.env.API_URL || "https://api.redsolidaria.com"],
    frameSrc: ["'none'"],
    objectSrc: ["'none'"],
    upgradeInsecureRequests: [],
  };
}

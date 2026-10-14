import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  DEFAULT_LOGO_PATH,
  resolvePublicBaseUrl,
  serializeJsonLd,
} from "@/lib/structured-data";

// Sustituye a react-helmet-async (3.0.0 rompía el arranque con Vite:
// "Cannot access 'H' before initialization" por imports circulares en su
// bundle ESM). Sin dependencias: actualiza title/meta tags directamente
// en <head> con el mismo API que usaban las páginas.

/**
 * URL pública del sitio (FE-09): antes estaba fija en el código, así que un
 * dominio distinto generaba canonical y Open Graph apuntando al dominio viejo.
 * Se puede configurar con `VITE_PUBLIC_URL` y por defecto es el despliegue
 * actual.
 */
export const PUBLIC_BASE_URL = resolvePublicBaseUrl(import.meta.env.VITE_PUBLIC_URL);

const DEFAULT_IMAGE = "/opengraph.jpg";
const JSON_LD_ELEMENT_ID = "rs-json-ld";

interface SEOProps {
  title?: string;
  description?: string;
  image?: string;
  url?: string;
  type?: "website" | "article";
  noIndex?: boolean;
  /**
   * Datos estructurados (JSON-LD) de la página. Se publican en un
   * `<script type="application/ld+json">` y se **retiran** al pasar a una página
   * que no los define: si no, la siguiente heredaría los de la anterior.
   */
  jsonLd?: Record<string, unknown> | Record<string, unknown>[];
}

function upsertMeta(attr: "name" | "property", key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function upsertLink(rel: string, href: string) {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", rel);
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

function upsertAlternate(hreflang: string, href: string) {
  let el = document.head.querySelector<HTMLLinkElement>(
    `link[rel="alternate"][hreflang="${hreflang}"]`,
  );
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", "alternate");
    el.setAttribute("hreflang", hreflang);
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

/** Retira los alternates de idioma que ya no corresponden. */
function removeAlternatesExcept(keep: readonly string[]) {
  document.head
    .querySelectorAll<HTMLLinkElement>('link[rel="alternate"][hreflang]')
    .forEach((el) => {
      const lang = el.getAttribute("hreflang");
      if (!lang || !keep.includes(lang)) el.remove();
    });
}

/**
 * Publica (o retira) los datos estructurados. Recibe el texto YA serializado
 * para que el efecto dependa de un valor estable: las páginas construyen el
 * objeto en cada render y comparar objetos haría reejecutar el efecto siempre.
 */
function upsertJsonLdPayload(payload: string) {
  document.getElementById(JSON_LD_ELEMENT_ID)?.remove();
  if (!payload) return;

  const script = document.createElement("script");
  script.type = "application/ld+json";
  script.id = JSON_LD_ELEMENT_ID;
  script.textContent = payload;
  document.head.appendChild(script);
}

export default function SEO({
  title,
  description,
  image = DEFAULT_IMAGE,
  url,
  type = "website",
  noIndex = false,
  jsonLd,
}: SEOProps) {
  const { t, i18n } = useTranslation();
  // El idioma activo gobierna og:locale y la descripción por defecto.
  const lang = i18n.language?.toLowerCase().startsWith("en") ? "en" : "es";
  const jsonLdPayload = jsonLd ? serializeJsonLd(jsonLd) : "";

  useEffect(() => {
    const siteName = t("seo.siteName");
    const defaultDescription = t("seo.defaultDescription");
    const resolvedDescription = description ?? defaultDescription;
    const fullTitle = title ? `${title} | ${siteName}` : siteName;
    const fullUrl = url ? `${PUBLIC_BASE_URL}${url}` : PUBLIC_BASE_URL;
    const fullImage = image.startsWith("http") ? image : `${PUBLIC_BASE_URL}${image}`;

    document.title = fullTitle;
    upsertMeta("name", "description", resolvedDescription);
    upsertMeta("name", "robots", noIndex ? "noindex, nofollow" : "index, follow");

    // Open Graph
    upsertMeta("property", "og:type", type);
    upsertMeta("property", "og:title", fullTitle);
    upsertMeta("property", "og:description", resolvedDescription);
    upsertMeta("property", "og:image", fullImage);
    upsertMeta("property", "og:url", fullUrl);
    upsertMeta("property", "og:site_name", siteName);
    upsertMeta("property", "og:locale", lang === "en" ? "en_US" : "es_PE");
    upsertMeta("property", "og:locale:alternate", lang === "en" ? "es_PE" : "en_US");

    // Twitter Card
    upsertMeta("name", "twitter:card", "summary_large_image");
    upsertMeta("name", "twitter:title", fullTitle);
    upsertMeta("name", "twitter:description", resolvedDescription);
    upsertMeta("name", "twitter:image", fullImage);

    // Canonical. Sobre hreflang: el sitio se sirve en UNA sola URL (el idioma se
    // persiste en el navegador y los rastreadores reciben el contenido por
    // defecto en español), así que declarar `es` y `en` apuntando a la misma URL
    // es engañoso para los buscadores: se declara solo `x-default` y se retiran
    // los alternates de idioma que hubieran quedado de una versión anterior.
    upsertLink("canonical", fullUrl);
    upsertAlternate("x-default", fullUrl);
    removeAlternatesExcept(["x-default"]);

    // Datos estructurados de la página.
    upsertJsonLdPayload(jsonLdPayload);
  }, [t, lang, title, description, image, url, type, noIndex, jsonLdPayload]);

  return null;
}

/** Logotipo por defecto, reexportado para quien construya JSON-LD. */
export { DEFAULT_LOGO_PATH };

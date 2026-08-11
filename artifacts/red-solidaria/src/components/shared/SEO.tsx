import { useEffect } from "react";
import { useTranslation } from "react-i18next";

// Sustituye a react-helmet-async (3.0.0 rompía el arranque con Vite:
// "Cannot access 'H' before initialization" por imports circulares en su
// bundle ESM). Sin dependencias: actualiza title/meta tags directamente
// en <head> con el mismo API que usaban las páginas.

const BASE_URL = "https://redsolidariasanramon.org";
const DEFAULT_IMAGE = "/opengraph.jpg";

interface SEOProps {
  title?: string;
  description?: string;
  image?: string;
  url?: string;
  type?: "website" | "article";
  noIndex?: boolean;
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

export default function SEO({
  title,
  description,
  image = DEFAULT_IMAGE,
  url,
  type = "website",
  noIndex = false,
}: SEOProps) {
  const { t, i18n } = useTranslation();
  // El idioma activo gobierna og:locale, descripción por defecto y hreflang.
  const lang = i18n.language?.toLowerCase().startsWith("en") ? "en" : "es";

  useEffect(() => {
    const siteName = t("seo.siteName");
    const defaultDescription = t("seo.defaultDescription");
    const resolvedDescription = description ?? defaultDescription;
    const fullTitle = title ? `${title} | ${siteName}` : siteName;
    const fullUrl = url ? `${BASE_URL}${url}` : BASE_URL;
    const fullImage = image.startsWith("http") ? image : `${BASE_URL}${image}`;

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

    // Canonical + alternates de idioma (misma URL: el idioma se persiste en
    // el navegador; los crawlers reciben el contenido por defecto en es).
    upsertLink("canonical", fullUrl);
    upsertAlternate("es", fullUrl);
    upsertAlternate("en", fullUrl);
    upsertAlternate("x-default", fullUrl);
  }, [t, lang, title, description, image, url, type, noIndex]);

  return null;
}

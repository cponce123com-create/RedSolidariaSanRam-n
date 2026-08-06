import { useEffect } from "react";

// Sustituye a react-helmet-async (3.0.0 rompía el arranque con Vite:
// "Cannot access 'H' before initialization" por imports circulares en su
// bundle ESM). Sin dependencias: actualiza title/meta tags directamente
// en <head> con el mismo API que usaban las páginas.

const SITE_NAME = "Red Solidaria San Ramón";
const BASE_URL = "https://redsolidariasanramon.org";
const DEFAULT_IMAGE = "/opengraph.jpg";
const DEFAULT_DESCRIPTION =
  "Organización solidaria en San Ramón, Chanchamayo, Perú. Apoyamos campañas sociales, protección animal y bienestar comunitario.";

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

export default function SEO({
  title,
  description = DEFAULT_DESCRIPTION,
  image = DEFAULT_IMAGE,
  url,
  type = "website",
  noIndex = false,
}: SEOProps) {
  const fullTitle = title ? `${title} | ${SITE_NAME}` : SITE_NAME;
  const fullUrl = url ? `${BASE_URL}${url}` : BASE_URL;
  const fullImage = image.startsWith("http") ? image : `${BASE_URL}${image}`;

  useEffect(() => {
    document.title = fullTitle;
    upsertMeta("name", "description", description);
    upsertMeta("name", "robots", noIndex ? "noindex, nofollow" : "index, follow");

    // Open Graph
    upsertMeta("property", "og:type", type);
    upsertMeta("property", "og:title", fullTitle);
    upsertMeta("property", "og:description", description);
    upsertMeta("property", "og:image", fullImage);
    upsertMeta("property", "og:url", fullUrl);
    upsertMeta("property", "og:site_name", SITE_NAME);
    upsertMeta("property", "og:locale", "es_PE");

    // Twitter Card
    upsertMeta("name", "twitter:card", "summary_large_image");
    upsertMeta("name", "twitter:title", fullTitle);
    upsertMeta("name", "twitter:description", description);
    upsertMeta("name", "twitter:image", fullImage);

    // Canonical
    upsertLink("canonical", fullUrl);
  }, [fullTitle, description, fullImage, fullUrl, noIndex, type]);

  return null;
}

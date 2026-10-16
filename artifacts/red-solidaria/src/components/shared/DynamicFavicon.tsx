import { useEffect } from "react";
import { useInstitutionalIdentity } from "@/hooks/use-institutional-identity";

/**
 * Favicon dinámico (V18).
 *
 * Actualiza el `link[rel="icon"]` del documento con el favicon PUBLICADO, de modo
 * que al cambiarlo en el panel la pestaña se actualice sin tocar el HTML.
 *
 * CACHÉ DEL NAVEGADOR: los navegadores cachean el favicon con mucha agresividad. Por
 * eso la URL se sirve VERSIONADA (`?v=<fecha de publicación>`): al publicar un
 * favicon nuevo cambia el parámetro y el navegador descarga el nuevo en vez de
 * reutilizar el viejo.
 *
 * RESPALDO: si no hay favicon publicado se RESTAURA el estático del `index.html`
 * (`/favicon.svg`), que nunca se elimina. Solo se modifica ese mismo `link`, así
 * nunca hay dos iconos en conflicto.
 */
export function DynamicFavicon() {
  const { data: identity } = useInstitutionalIdentity();
  const url = identity?.favicon?.url ?? "";
  const publishedAt = identity?.publishedAt ?? "";

  useEffect(() => {
    const link = document.querySelector<HTMLLinkElement>('link[rel~="icon"]');
    if (!link) return;

    // Guarda el estado original UNA vez, para poder restaurarlo al despublicar.
    if (!link.hasAttribute("data-original-href")) {
      link.setAttribute("data-original-href", link.getAttribute("href") ?? "");
      link.setAttribute("data-original-type", link.getAttribute("type") ?? "");
    }
    const originalHref = link.getAttribute("data-original-href") ?? "";
    const originalType = link.getAttribute("data-original-type") ?? "";

    if (!url) {
      link.setAttribute("href", originalHref);
      if (originalType) link.setAttribute("type", originalType);
      else link.removeAttribute("type");
      return;
    }

    const separator = url.includes("?") ? "&" : "?";
    const version = publishedAt || String(Date.now());
    link.setAttribute("href", `${url}${separator}v=${encodeURIComponent(version)}`);
    link.setAttribute("type", /\.webp(\?|$)/i.test(url) ? "image/webp" : "image/png");
  }, [url, publishedAt]);

  return null;
}

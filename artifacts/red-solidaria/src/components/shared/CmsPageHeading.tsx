import { useTranslation } from "react-i18next";
import { useCmsPage } from "@/hooks/use-cms-page";
import { cmsText, isBlockEnabled, resolveLocale } from "@/lib/cms";

/**
 * Encabezado administrable de una página del CMS (bloque «hero»).
 *
 * El texto de i18n es el valor por DEFECTO: si el superadmin publica un título o un
 * subtítulo en «Contenido → Editor de páginas», se muestra ese; si no, se conserva el
 * original. Si el bloque «hero» está DESACTIVADO, el encabezado no se renderiza.
 *
 * Se usa en las páginas cuyo encabezado es un título + subtítulo, para no duplicar en
 * cada una la lectura del CMS y el respaldo de idioma.
 */
interface CmsPageHeadingProps {
  /** Slug de la página del CMS (`campanas`, `contacto`, …). */
  slug: string;
  /** Título por defecto (i18n). */
  title: string;
  /** Subtítulo por defecto (i18n). */
  subtitle?: string;
  titleClassName?: string;
  subtitleClassName?: string;
}

export function CmsPageHeading({
  slug,
  title,
  subtitle,
  titleClassName,
  subtitleClassName,
}: CmsPageHeadingProps) {
  const { i18n } = useTranslation();
  const locale = resolveLocale(i18n.language);
  const { data: cms } = useCmsPage(slug);

  if (!isBlockEnabled(cms, "hero")) return null;

  const heading = cmsText(cms, "hero", "title", locale, title);
  const sub = cmsText(cms, "hero", "subtitle", locale, subtitle ?? "");

  return (
    <>
      <h1 className={titleClassName}>{heading}</h1>
      {sub ? <p className={subtitleClassName}>{sub}</p> : null}
    </>
  );
}

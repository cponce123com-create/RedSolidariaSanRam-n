import { motion } from "framer-motion";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { ArrowRight } from "lucide-react";
import { SectionContainer } from "./SectionHeading";
import { useCmsPage } from "@/hooks/use-cms-page";
import { cmsAsset, cmsLink, cmsText, resolveImage, resolveLocale } from "@/lib/cms";
import { buildSrcSet, DEFAULT_IMAGE_SIZES } from "@/lib/image-url";

/**
 * Imagen estática de RESPALDO. La sección se administra desde el CMS
 * («Nuestra historia» → bloque «Imagen + texto»): si el superadmin publica una
 * imagen, se usa esa con su ENCUADRE (`object-position`) y sus variantes
 * responsivas; si no, se muestra esta. Antes la imagen estaba fija en el código
 * con `object-cover` y sin foco, y por eso salía recortada.
 */
const STORY_PHOTO = `${import.meta.env.BASE_URL}images/historia-red.jpg`;

/**
 * "Somos una red, no solo una página." — diseño editorial con fotografía real y el
 * origen de la organización. El texto y la imagen son administrables; si no hay nada
 * publicado, se mantiene exactamente el contenido por defecto (i18n + imagen estática).
 */
export function StorySection() {
  const { t, i18n } = useTranslation();
  const locale = resolveLocale(i18n.language);
  const { data: cms } = useCmsPage("historia");

  const image = resolveImage(cmsAsset(cms, "imageText", "image"), locale, {
    src: STORY_PHOTO,
    alt: t("home.storyPhotoAlt"),
    focus: "50% 50%",
    ratio: "4/3",
  });
  const srcSet = buildSrcSet(image.src);

  const heading = cmsText(cms, "imageText", "heading", locale, t("home.storyTitle"));
  const richText = cmsText(cms, "imageText", "html", locale, "");
  const ctaLabel = cmsText(cms, "imageText", "ctaLabel", locale, t("home.storyCta"));
  const ctaHref = cmsLink(cms, "imageText", "ctaHref", locale, "/nosotros");

  return (
    <SectionContainer className="bg-card/40">
      <div className="grid items-center gap-12 lg:grid-cols-12 lg:gap-16">
        {/* Fotografía */}
        <motion.div
          initial={{ opacity: 0, x: -24 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6 }}
          className="lg:col-span-6"
        >
          <div className="relative">
            <div
              className="absolute -left-4 -top-4 h-full w-full rounded-3xl border-2 border-primary/20"
              aria-hidden
            />
            <div className="relative overflow-hidden rounded-3xl border border-border/60 shadow-lg">
              <img
                src={image.src}
                srcSet={srcSet || undefined}
                sizes={srcSet ? DEFAULT_IMAGE_SIZES : undefined}
                alt={image.alt}
                loading="lazy"
                decoding="async"
                style={{ objectPosition: image.focus }}
                className="aspect-[4/3] w-full object-cover"
              />
            </div>
            <div className="absolute -bottom-5 -right-4 hidden rounded-2xl bg-forest px-5 py-4 text-white shadow-lg sm:block">
              <p className="font-display text-sm font-bold uppercase tracking-[0.16em] leading-tight">
                {t("about.historyBadge")}
              </p>
              <p className="mt-1 text-xs font-medium uppercase tracking-wide text-white/60">
                {t("home.campaignsLocation")}
              </p>
            </div>
          </div>
        </motion.div>

        {/* Texto */}
        <motion.div
          initial={{ opacity: 0, x: 24 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="lg:col-span-6"
        >
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">
            {t("about.historyBadge")}
          </p>
          <h2 className="mt-4 font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            {heading}
          </h2>
          {richText ? (
            // El HTML ya viene SANEADO por el servidor (allowlist estricta, doble
            // pasada al escribir y al leer): no puede contener scripts ni atributos
            // peligrosos.
            <div
              className="mt-5 space-y-4 text-base leading-relaxed text-muted-foreground sm:text-lg [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-4 [&_p]:leading-relaxed [&_strong]:font-semibold [&_strong]:text-foreground"
              dangerouslySetInnerHTML={{ __html: richText }}
            />
          ) : (
            <>
              <p className="mt-5 text-base leading-relaxed text-muted-foreground sm:text-lg">
                {t("home.storyText1")}
              </p>
              <p className="mt-4 text-base leading-relaxed text-muted-foreground sm:text-lg">
                {t("home.storyText2")}
              </p>
            </>
          )}
          <Link
            href={ctaHref}
            className="group mt-7 inline-flex items-center gap-2 font-semibold text-primary underline-offset-4 hover:underline"
          >
            {ctaLabel}
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </motion.div>
      </div>
    </SectionContainer>
  );
}

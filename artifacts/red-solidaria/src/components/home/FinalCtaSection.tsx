import { motion } from "framer-motion";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { HandHeart, LifeBuoy } from "lucide-react";
import { useCmsPage } from "@/hooks/use-cms-page";
import { cmsLink, cmsText, resolveLocale } from "@/lib/cms";

/**
 * CTA final antes del footer: "Una comunidad cambia cuando decide no mirar hacia otro
 * lado." — botones a las dos vías principales. Textos y enlaces administrables desde
 * el CMS (página «Inicio» → bloque «Llamada a la acción»).
 */
export function FinalCtaSection() {
  const { t, i18n } = useTranslation();
  const locale = resolveLocale(i18n.language);
  const { data: cms } = useCmsPage("inicio");

  const heading = cmsText(cms, "cta", "heading", locale, t("home.finalCtaTitle"));
  const subtitle = cmsText(cms, "cta", "subtitle", locale, t("home.finalCtaSubtitle"));
  const helpLabel = cmsText(cms, "cta", "ctaLabel", locale, t("home.finalCtaHelp"));
  const helpHref = cmsLink(cms, "cta", "ctaHref", locale, "/como-ayudar");
  const needLabel = cmsText(cms, "cta", "ctaLabel2", locale, t("home.finalCtaNeedHelp"));
  const needHref = cmsLink(cms, "cta", "ctaHref2", locale, "/reportar");

  return (
    <section className="bg-forest py-20 sm:py-28">
      <div className="mx-auto max-w-4xl px-4 text-center sm:px-6">
        <motion.h2
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6 }}
          className="font-display text-3xl font-bold leading-tight tracking-tight text-white sm:text-5xl"
        >
          {heading}
        </motion.h2>
        <motion.p
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6, delay: 0.12 }}
          className="mt-5 text-lg text-white/70 sm:text-xl"
        >
          {subtitle}
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6, delay: 0.24 }}
          className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row"
        >
          <Link
            href={helpHref}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white px-8 py-4 text-base font-bold text-forest shadow-lg transition-all hover:-translate-y-0.5 hover:bg-white/90 hover:shadow-xl sm:w-auto"
          >
            <HandHeart className="h-5 w-5" />
            {helpLabel}
          </Link>
          <Link
            href={needHref}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl border-2 border-white/30 px-8 py-4 text-base font-bold text-white transition-all hover:-translate-y-0.5 hover:border-white/60 hover:bg-white/10 sm:w-auto"
          >
            <LifeBuoy className="h-5 w-5" />
            {needLabel}
          </Link>
        </motion.div>
      </div>
    </section>
  );
}

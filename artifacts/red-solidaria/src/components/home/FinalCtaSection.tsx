import { motion } from "framer-motion";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { HandHeart, LifeBuoy } from "lucide-react";

/**
 * CTA final antes del footer: "Una comunidad cambia cuando decide no
 * mirar hacia otro lado." — botones a las dos vías principales.
 */
export function FinalCtaSection() {
  const { t } = useTranslation();

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
          {t("home.finalCtaTitle")}
        </motion.h2>
        <motion.p
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6, delay: 0.12 }}
          className="mt-5 text-lg text-white/70 sm:text-xl"
        >
          {t("home.finalCtaSubtitle")}
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6, delay: 0.24 }}
          className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row"
        >
          <Link
            href="/como-ayudar"
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white px-8 py-4 text-base font-bold text-forest shadow-lg transition-all hover:-translate-y-0.5 hover:bg-white/90 hover:shadow-xl sm:w-auto"
          >
            <HandHeart className="h-5 w-5" />
            {t("home.finalCtaHelp")}
          </Link>
          <Link
            href="/reportar"
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl border-2 border-white/30 px-8 py-4 text-base font-bold text-white transition-all hover:-translate-y-0.5 hover:border-white/60 hover:bg-white/10 sm:w-auto"
          >
            <LifeBuoy className="h-5 w-5" />
            {t("home.finalCtaNeedHelp")}
          </Link>
        </motion.div>
      </div>
    </section>
  );
}

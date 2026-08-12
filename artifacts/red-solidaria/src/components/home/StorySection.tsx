import { motion } from "framer-motion";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { ArrowRight } from "lucide-react";
import { SectionContainer } from "./SectionHeading";

const STORY_PHOTO = `${import.meta.env.BASE_URL}images/historia-red.jpg`;

/**
 * "Somos una red, no solo una página." — diseño editorial con fotografía
 * real y el origen de la organización (reutiliza el texto de /nosotros).
 */
export function StorySection() {
  const { t } = useTranslation();

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
                src={STORY_PHOTO}
                alt={t("home.storyPhotoAlt")}
                loading="lazy"
                decoding="async"
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
            {t("home.storyTitle")}
          </h2>
          <p className="mt-5 text-base leading-relaxed text-muted-foreground sm:text-lg">
            {t("home.storyText1")}
          </p>
          <p className="mt-4 text-base leading-relaxed text-muted-foreground sm:text-lg">
            {t("home.storyText2")}
          </p>
          <Link
            href="/nosotros"
            className="group mt-7 inline-flex items-center gap-2 font-semibold text-primary underline-offset-4 hover:underline"
          >
            {t("home.storyCta")}
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </motion.div>
      </div>
    </SectionContainer>
  );
}

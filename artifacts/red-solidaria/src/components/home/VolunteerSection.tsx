import { motion } from "framer-motion";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { ArrowRight, HeartHandshake } from "lucide-react";
import { SectionContainer } from "./SectionHeading";

/**
 * "La solidaridad también necesita personas." — banda de voluntariado
 * que enlaza al formulario existente (/voluntariado).
 */
export function VolunteerSection() {
  const { t } = useTranslation();

  return (
    <SectionContainer className="bg-secondary/50">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.55 }}
        className="mx-auto flex max-w-4xl flex-col items-center gap-6 text-center sm:gap-8"
      >
        <span className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-white shadow-md">
          <HeartHandshake className="h-8 w-8" />
        </span>
        <div>
          <h2 className="font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            {t("home.volunteerSectionTitle")}
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            {t("home.volunteerSectionDesc")}
          </p>
        </div>
        <Link
          href="/voluntariado"
          className="group inline-flex items-center gap-2 rounded-xl bg-forest px-7 py-3.5 text-base font-semibold text-white shadow-md transition-all hover:-translate-y-0.5 hover:bg-forest/90 hover:shadow-lg"
        >
          {t("home.volunteerCta2")}
          <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </motion.div>
    </SectionContainer>
  );
}

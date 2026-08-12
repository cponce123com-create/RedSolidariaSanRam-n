import { motion } from "framer-motion";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { ArrowRight, ChevronDown, HandHeart, LifeBuoy } from "lucide-react";
import { useGetCampaigns, useGetDonationStats } from "@workspace/api-client-react";

const HERO_PHOTO = `${import.meta.env.BASE_URL}images/hero-comunidad.jpg`;

/**
 * Hero editorial del nuevo home: texto a la izquierda, fotografía real de
 * la comunidad a la derecha. Responde en <5s a: qué es, pedir ayuda, ayudar.
 */
export function HomeHero() {
  const { t } = useTranslation();

  const { data: campaigns } = useGetCampaigns({ status: "active" });
  const { data: donationStats } = useGetDonationStats();

  const activeCount = Array.isArray(campaigns) ? campaigns.length : 0;
  const totalAmount = donationStats?.totalAmount ?? 0;

  return (
    <section
      aria-label={t("seo.siteName")}
      className="relative overflow-hidden bg-background"
    >
      {/* Textura sutil: dosel de la selva muy tenue */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 20% 20%, #238b35 0, transparent 45%), radial-gradient(circle at 85% 75%, #123b24 0, transparent 40%)",
        }}
      />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-12 pb-16 sm:pt-20 sm:pb-24 lg:pt-24 lg:pb-28">
        <div className="grid gap-12 lg:grid-cols-12 lg:gap-10 items-center">
          {/* ── Texto ─────────────────────────────────────────────── */}
          <div className="lg:col-span-6 xl:col-span-6">
            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="inline-flex items-center gap-2 rounded-full border border-border bg-card/70 px-3.5 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-primary shadow-sm"
            >
              {t("home.heroEyebrow")}
            </motion.p>

            <motion.h1
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.08 }}
              className="mt-5 font-display text-4xl sm:text-5xl lg:text-[3.4rem] font-bold leading-[1.05] tracking-tight text-foreground"
            >
              {t("nav.brand")}
              <span className="block text-primary">{t("nav.brandLocation")}</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.16 }}
              className="mt-6 font-display text-xl sm:text-2xl font-semibold leading-snug text-foreground"
            >
              {t("home.heroLead")}{" "}
              <span className="text-primary">{t("home.heroLeadAccent")}</span>
            </motion.p>

            <motion.p
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.24 }}
              className="mt-4 max-w-xl text-base sm:text-lg leading-relaxed text-muted-foreground"
            >
              {t("home.heroIntro")}
            </motion.p>

            {/* CTAs principales */}
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.32 }}
              className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center"
            >
              <Button
                asChild
                size="lg"
                className="h-14 rounded-xl bg-primary px-7 text-base font-semibold shadow-md hover:bg-primary/90 hover:shadow-lg transition-all"
              >
                <Link href="/como-ayudar">
                  <HandHeart className="mr-2 h-5 w-5" />
                  {t("home.heroCtaHelp")}
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="h-14 rounded-xl border-primary/30 bg-card px-7 text-base font-semibold text-primary hover:border-primary/60 hover:bg-secondary/60 transition-all"
              >
                <Link href="/reportar">
                  <LifeBuoy className="mr-2 h-5 w-5" />
                  {t("home.heroCtaNeedHelp")}
                </Link>
              </Button>
              <Link
                href="/nosotros"
                className="group inline-flex items-center gap-1.5 px-2 py-2 text-sm font-semibold text-muted-foreground hover:text-primary transition-colors"
              >
                {t("home.heroCtaNetwork")}
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </motion.div>

            {/* Datos reales de confianza */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.7, delay: 0.45 }}
              className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-border pt-6 text-sm text-muted-foreground"
            >
              {totalAmount > 0 && (
                <span className="flex items-baseline gap-1.5">
                  <strong className="font-display text-lg font-bold text-foreground">
                    S/ {totalAmount.toLocaleString("es-PE")}
                  </strong>
                  <span>{t("home.transparencyStatRaised")}</span>
                </span>
              )}
              {activeCount > 0 && (
                <span className="flex items-baseline gap-1.5">
                  <strong className="font-display text-lg font-bold text-foreground">{activeCount}</strong>
                  <span>{t("home.heroTrustActiveCampaigns")}</span>
                </span>
              )}
            </motion.div>
          </div>

          {/* ── Fotografía editorial ───────────────────────────────── */}
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.7, delay: 0.2 }}
            className="lg:col-span-6 xl:col-span-6"
          >
            <figure className="relative isolate">
              <div
                className="absolute -inset-3 -z-10 rounded-[2rem] bg-gradient-to-br from-primary/15 via-transparent to-transparent"
                aria-hidden
              />
              <div className="overflow-hidden rounded-3xl border border-border/60 shadow-xl">
                <img
                  src={HERO_PHOTO}
                  alt={t("home.heroPhotoAlt")}
                  loading="eager"
                  decoding="async"
                  className="aspect-[4/3] w-full object-cover"
                />
              </div>
              {/* Pie de foto tipo editorial */}
              <figcaption className="mt-3 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                <span className="font-medium uppercase tracking-[0.14em]">
                  {t("home.heroPhotoCaption")}
                </span>
                <span className="hidden sm:inline-flex h-px flex-1 bg-border" aria-hidden />
              </figcaption>
            </figure>
          </motion.div>
        </div>

        {/* Indicador de scroll */}
        <div className="mt-14 hidden justify-center sm:flex" aria-hidden>
          <motion.span
            animate={{ y: [0, 6, 0] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
            className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground/70"
          >
            {t("home.heroScroll")}
            <ChevronDown className="h-4 w-4" />
          </motion.span>
        </div>
      </div>
    </section>
  );
}

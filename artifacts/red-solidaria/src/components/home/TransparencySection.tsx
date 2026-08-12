import { motion } from "framer-motion";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { ArrowRight, HandCoins, ReceiptText, ShieldCheck } from "lucide-react";
import { useGetDonationStats, useGetStats } from "@workspace/api-client-react";

/**
 * "Tu ayuda tiene rostro y destino." — transparencia protagonista con
 * cifras reales del sistema (donations/stats + impact stats).
 * Si no hay datos, muestra un estado vacío elegante (no inventa cifras).
 */
export function TransparencySection() {
  const { t } = useTranslation();

  const { data: donationStats } = useGetDonationStats();
  const { data: impactStats } = useGetStats();

  const hasData =
    (donationStats &&
      (donationStats.totalAmount > 0 ||
        donationStats.approvedCount > 0 ||
        donationStats.totalDonors > 0)) ||
    (impactStats && impactStats.volunteers > 0);

  const stats: Array<{ label: string; value: string | null }> = [
    {
      label: t("home.transparencyStatRaised"),
      value: donationStats ? `S/ ${donationStats.totalAmount.toLocaleString("es-PE")}` : null,
    },
    {
      label: t("home.transparencyStatHelps"),
      value: donationStats ? donationStats.approvedCount.toLocaleString("es-PE") : null,
    },
    {
      label: t("home.transparencyStatPeople"),
      value: donationStats ? donationStats.totalDonors.toLocaleString("es-PE") : null,
    },
    {
      label: t("home.transparencyStatVolunteers"),
      value: impactStats ? impactStats.volunteers.toLocaleString("es-PE") : null,
    },
  ];

  const steps = [
    { icon: HandCoins, title: t("home.transparencyStep1Title"), desc: t("home.transparencyStep1Desc") },
    { icon: ReceiptText, title: t("home.transparencyStep2Title"), desc: t("home.transparencyStep2Desc") },
    { icon: ShieldCheck, title: t("home.transparencyStep3Title"), desc: t("home.transparencyStep3Desc") },
  ];

  return (
    <section className="bg-forest py-16 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-12 lg:grid-cols-12 lg:items-center">
          {/* Texto + CTA */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.55 }}
            className="lg:col-span-5"
          >
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary-foreground/70">
              {t("home.transparencyStep1Title")} · {t("home.transparencyStep2Title")} ·{" "}
              {t("home.transparencyStep3Title")}
            </p>
            <h2 className="mt-4 font-display text-3xl font-bold tracking-tight text-white sm:text-4xl">
              {t("home.transparencySectionTitle")}
            </h2>
            <p className="mt-4 text-base leading-relaxed text-white/70 sm:text-lg">
              {t("home.transparencySectionSubtitle")}
            </p>
            <div className="mt-7">
              <Button
                asChild
                size="lg"
                className="h-13 rounded-xl bg-white px-7 text-base font-semibold text-forest shadow-md hover:bg-white/90"
              >
                <Link href="/transparencia">
                  {t("home.transparencyCta2")}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </motion.div>

          {/* Cifras reales */}
          <div className="lg:col-span-7">
            {hasData ? (
              <motion.dl
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-80px" }}
                transition={{ duration: 0.55, delay: 0.1 }}
                className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 sm:grid-cols-4"
              >
                {stats.map((stat) => (
                  <div key={stat.label} className="bg-forest p-5 sm:p-6">
                    <dd className="font-display text-2xl font-bold text-white sm:text-3xl">
                      {stat.value ?? "—"}
                    </dd>
                    <dt className="mt-1 text-xs font-medium uppercase tracking-wide text-white/55">
                      {stat.label}
                    </dt>
                  </div>
                ))}
              </motion.dl>
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: 0.1 }}
                className="flex flex-col items-start gap-4 rounded-2xl border border-white/10 bg-white/5 p-8"
              >
                <ShieldCheck className="h-10 w-10 text-primary-foreground/80" />
                <p className="text-lg font-semibold text-white">{t("transparency.emptyTitle")}</p>
                <p className="text-sm leading-relaxed text-white/65">
                  {t("transparency.emptyDescription")}
                </p>
              </motion.div>
            )}

            {/* Cómo funciona */}
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              {steps.map((step, i) => (
                <motion.div
                  key={step.title}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-60px" }}
                  transition={{ duration: 0.5, delay: 0.15 + i * 0.1 }}
                  className="flex gap-3 rounded-xl border border-white/10 bg-white/5 p-4"
                >
                  <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/30 text-primary-foreground">
                    <step.icon className="h-5 w-5" />
                  </span>
                  <div>
                    <h3 className="text-sm font-bold text-white">{step.title}</h3>
                    <p className="mt-1 text-xs leading-relaxed text-white/60">{step.desc}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

import { motion } from "framer-motion";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { AlertTriangle, ArrowRight, Megaphone } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { optimizeImageUrl } from "@/lib/image-url";

/** Subconjunto de CommunityReport devuelto por GET /api/reports/featured. */
interface FeaturedReport {
  id: number;
  type: string;
  title: string;
  description: string;
  location: string;
  urgency: string;
  photos: string[] | null;
  campaignId: number | null;
  createdAt: string;
}

const URGENCY_STYLES: Record<string, string> = {
  critical: "bg-red-600 text-white",
  high: "bg-amber-500 text-white",
  medium: "bg-primary text-white",
  low: "bg-secondary text-secondary-foreground",
};

/**
 * Casos urgentes destacados (solo se muestra si el backend devuelve casos
 * reales marcados como featuredOnHome).
 */
export function UrgentCasesSection() {
  const { t } = useTranslation();

  const { data: reports, isLoading } = useQuery<FeaturedReport[]>({
    queryKey: ["home-featured-reports"],
    queryFn: async () => {
      const res = await fetch("/api/reports/featured");
      if (!res.ok) throw new Error("failed");
      return res.json();
    },
  });

  if (!isLoading && (!reports || reports.length === 0)) return null;

  const visible = (reports ?? []).slice(0, 3);

  return (
    <section className="bg-forest py-16 sm:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-12 lg:items-center">
          {/* Encabezado */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.55 }}
            className="lg:col-span-4"
          >
            <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3.5 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-white/85">
              <Megaphone className="h-3.5 w-3.5" />
              {t("home.urgentTag")}
            </p>
            <h2 className="mt-5 font-display text-3xl font-bold tracking-tight text-white sm:text-4xl">
              {t("home.urgentTag")}
            </h2>
            <p className="mt-4 text-base leading-relaxed text-white/70">
              {t("home.urgentSubtitle")}
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row lg:flex-col xl:flex-row">
              <Link
                href="/casos-urgentes"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-forest shadow-md transition-all hover:bg-white/90"
              >
                {t("home.urgentViewAll")}
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/reportar"
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/25 px-5 py-3 text-sm font-semibold text-white transition-all hover:border-white/50 hover:bg-white/10"
              >
                {t("home.urgentReportHere")}
              </Link>
            </div>
          </motion.div>

          {/* Lista de casos */}
          <div className="lg:col-span-8">
            <div className="grid gap-4 sm:grid-cols-2">
              {visible.map((report, i) => (
                <motion.article
                  key={report.id}
                  initial={{ opacity: 0, y: 24 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-60px" }}
                  transition={{ duration: 0.5, delay: i * 0.1 }}
                  className="flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm transition-colors hover:bg-white/10"
                >
                  <div className="flex items-center gap-2 px-5 pt-4">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${
                        URGENCY_STYLES[report.urgency] ?? URGENCY_STYLES.medium
                      }`}
                    >
                      <AlertTriangle className="h-3 w-3" />
                      {t(`home.urgency${report.urgency === "critical" ? "Critical" : report.urgency === "high" ? "High" : "Normal"}`)}
                    </span>
                    <span className="ml-auto text-xs text-white/50">{report.location}</span>
                  </div>
                  <div className="flex flex-1 flex-col px-5 pb-5 pt-3">
                    <h3 className="font-display text-lg font-bold leading-snug text-white">
                      {report.title}
                    </h3>
                    <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-white/65">
                      {report.description}
                    </p>
                    <div className="mt-4 flex items-center gap-3">
                      {report.photos && report.photos.length > 0 && (
                        <img
                          src={optimizeImageUrl(report.photos[0], { width: 96 })}
                          alt=""
                          loading="lazy"
                          decoding="async"
                          className="h-14 w-14 rounded-xl object-cover"
                        />
                      )}
                      {report.campaignId ? (
                        <Link
                          href={`/campanas/${report.campaignId}`}
                          className="text-sm font-semibold text-white underline-offset-4 hover:underline"
                        >
                          {t("urgentCases.viewCampaign")} →
                        </Link>
                      ) : (
                        <Link
                          href="/reportar"
                          className="text-sm font-semibold text-white/80 underline-offset-4 hover:underline"
                        >
                          {t("urgentCases.wantToHelp")} →
                        </Link>
                      )}
                    </div>
                  </div>
                </motion.article>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

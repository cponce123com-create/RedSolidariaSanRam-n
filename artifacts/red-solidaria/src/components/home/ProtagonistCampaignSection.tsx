import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { Gift, Heart, HandHeart, ArrowRight, CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useGetCampaign } from "@workspace/api-client-react";
import { optimizeImageUrl } from "@/lib/image-url";
import {
  PROTAGONIST_SETTING_KEY,
  parseProtagonistId,
  resolveProtagonist,
} from "@/lib/chocofest";

/**
 * Lee el id de la campaña protagonista desde el endpoint público de settings.
 * Identificador ESTABLE (id numérico), no una coincidencia de título.
 */
export function useProtagonistId(): number | null {
  const { data } = useQuery<Record<string, string>>({
    queryKey: ["settings"],
    queryFn: async () => {
      const res = await fetch("/api/settings");
      if (!res.ok) throw new Error("No se pudo leer la configuración");
      return (await res.json()) as Record<string, string>;
    },
    staleTime: 5 * 60 * 1000,
  });

  return parseProtagonistId(data?.[PROTAGONIST_SETTING_KEY]);
}

/**
 * Bloque destacado de la campaña protagonista de la portada.
 *
 * Se renderiza SOLO si hay una campaña protagonista configurada, publicada,
 * activa y no finalizada. En cualquier otro caso devuelve `null` y la portada
 * general queda intacta. Todas las cifras provienen del backend: no se inventa
 * ninguna recaudación ni meta.
 */
export function ProtagonistCampaignSection() {
  const { t } = useTranslation();
  const protagonistId = useProtagonistId();

  const { data: campaign, isLoading } = useGetCampaign(protagonistId ?? 0, {
    query: {
      queryKey: ["/api/campaigns", protagonistId ?? 0],
      enabled: protagonistId !== null,
      retry: false,
      staleTime: 5 * 60 * 1000,
    },
  });

  const protagonist = resolveProtagonist(campaign, new Date());
  if (protagonistId === null || isLoading || !protagonist) return null;

  const goal = protagonist.goal ?? 0;
  const raised = protagonist.raised ?? 0;
  const hasGoal = goal > 0;
  const percent = hasGoal ? Math.min(100, Math.round((raised / goal) * 100)) : 0;
  const image = protagonist.imageUrl ? optimizeImageUrl(protagonist.imageUrl) : null;

  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-rose-50 via-background to-emerald-50 dark:from-rose-950/30 dark:via-background dark:to-emerald-950/30">
      {/* Guirnalda decorativa ligera (solo CSS, sin imágenes extra) */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-rose-500 via-amber-400 to-emerald-500"
      />
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.5 }}
          className="grid items-center gap-8 rounded-3xl border border-border/60 bg-card/80 p-6 shadow-sm backdrop-blur sm:p-8 lg:grid-cols-2 lg:gap-12"
        >
          <div className="order-2 lg:order-1">
            <span className="inline-flex items-center gap-2 rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-rose-700 dark:bg-rose-950/50 dark:text-rose-300">
              <Gift className="h-3.5 w-3.5" aria-hidden="true" />
              {t("home.protagonistBadge")}
            </span>

            <h2 className="mt-4 font-display text-2xl font-bold text-foreground sm:text-3xl">
              {protagonist.title}
            </h2>

            <p className="mt-3 line-clamp-3 text-sm text-muted-foreground sm:text-base">
              {protagonist.description}
            </p>

            {protagonist.startDate && (
              <p className="mt-3 inline-flex items-center gap-2 text-xs text-muted-foreground">
                <CalendarDays className="h-4 w-4" aria-hidden="true" />
                {protagonist.startDate}
                {protagonist.endDate ? ` — ${protagonist.endDate}` : ""}
              </p>
            )}

            {/* Metas y progreso: solo con datos reales disponibles */}
            <div className="mt-6">
              {hasGoal ? (
                <>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="font-semibold text-foreground">
                      {t("home.protagonistRaisedLabel")}: S/{" "}
                      {raised.toLocaleString("es-PE", { minimumFractionDigits: 0 })}
                    </span>
                    <span className="text-muted-foreground">
                      {t("home.protagonistGoalLabel")}: S/ {goal.toLocaleString("es-PE")}
                    </span>
                  </div>
                  <div
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={percent}
                    aria-label={t("home.protagonistProgress", { percent })}
                    className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-secondary"
                  >
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-rose-500 to-emerald-500"
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    {t("home.protagonistProgress", { percent })}
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {t("home.protagonistGoalPending")}
                </p>
              )}
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <Button asChild className="rounded-full gap-2 font-semibold shadow-lg shadow-primary/20">
                <Link href="/campanas">
                  <Heart className="h-4 w-4" aria-hidden="true" />
                  {t("home.protagonistCtaCollaborate")}
                </Link>
              </Button>
              <Button asChild variant="outline" className="rounded-full gap-2 font-semibold">
                <Link href={`/campanas/${protagonist.id}`}>
                  {t("home.protagonistCtaLearn")}
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </Button>
              <Button asChild variant="ghost" className="rounded-full gap-2 font-semibold text-primary">
                <Link href="/voluntariado">
                  <HandHeart className="h-4 w-4" aria-hidden="true" />
                  {t("home.protagonistCtaVolunteer")}
                </Link>
              </Button>
            </div>
          </div>

          {image && (
            <div className="order-1 lg:order-2">
              <img
                src={image}
                alt={protagonist.title}
                loading="eager"
                decoding="async"
                className="h-56 w-full rounded-2xl object-cover shadow-md sm:h-72 lg:h-80"
              />
            </div>
          )}
        </motion.div>
      </div>
    </section>
  );
}

import { Link } from "wouter";
import { AlertTriangle, ArrowRight } from "lucide-react";
import type { Campaign } from "@workspace/api-client-react";
import { useTranslation } from "react-i18next";
import { isUrgent } from "@/lib/campaign-urgency";
import { useCountdown } from "@/hooks/use-countdown";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface UrgencyBannerProps {
  campaign: Campaign;
  variant?: "full" | "compact";
  className?: string;
}

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Banner de "modo emergencia": se muestra solo para campañas activas cuya
 * fecha de cierre cae dentro del umbral de urgencia (≤ 7 días), con un
 * countdown en tiempo real. No renderiza nada si la campaña no es urgente
 * o la cuenta ya expiró.
 */
export function UrgencyBanner({ campaign, variant = "full", className }: UrgencyBannerProps) {
  const { t } = useTranslation();
  const { days, hours, minutes, seconds, expired } = useCountdown(campaign.endDate);

  if (!isUrgent(campaign) || expired) return null;

  if (variant === "compact") {
    return (
      <div
        data-testid="urgency-banner"
        className={cn(
          "flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-300/40 bg-gradient-to-r from-red-600 via-rose-600 to-orange-500 px-5 py-4 text-white shadow-lg shadow-red-600/20",
          className,
        )}
      >
        <div className="flex items-center gap-3 min-w-0">
          <AlertTriangle className="w-6 h-6 shrink-0 animate-pulse" aria-hidden="true" />
          <p className="text-sm sm:text-base font-bold leading-snug min-w-0">
            <span className="uppercase tracking-wide">{t("urgency.lastDays")}</span>{" "}
            <span className="opacity-95 font-semibold truncate inline-block align-bottom max-w-[38ch]">
              {campaign.title}
            </span>
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div
            className="flex items-baseline gap-1 font-display font-bold tabular-nums"
            aria-label={t("urgency.closesIn", { days, hours, minutes, seconds })}
          >
            <span className="text-xl">{days}d</span>
            <span className="text-lg opacity-90">{pad(hours)}h</span>
            <span className="text-lg opacity-90">{pad(minutes)}m</span>
            <span className="text-lg opacity-90">{pad(seconds)}s</span>
          </div>
          <Link href={`/campanas/${campaign.id}`}>
            <Button
              variant="default"
              size="sm"
              className="rounded-full bg-white text-red-600 border-white hover:bg-red-50 font-bold shadow-sm"
            >
              {t("urgency.supportNow")} <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div
      data-testid="urgency-banner"
      className={cn(
        "relative overflow-hidden rounded-3xl border border-red-300/40 bg-gradient-to-r from-red-600 via-rose-600 to-orange-500 text-white shadow-xl shadow-red-600/25",
        className,
      )}
    >
      {/* Decoración: blobs de luz + patrón, solo transform/opacity (barato en GPU) */}
      <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-white/15 blur-2xl" aria-hidden="true" />
      <div className="absolute -bottom-20 left-1/4 h-40 w-40 rounded-full bg-yellow-300/20 blur-2xl" aria-hidden="true" />

      <div className="relative flex flex-col md:flex-row md:items-center gap-6 p-6 md:p-8">
        <div className="flex items-center gap-4 flex-1 min-w-0">
          <div className="hidden sm:flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-sm">
            <AlertTriangle className="h-7 w-7 animate-pulse" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/90 mb-1">
              {t("urgency.mode")}
            </p>
            <h2 className="font-display text-xl md:text-2xl font-bold leading-tight">
              {t("urgency.lastDays")} {t("urgency.closingSoon")}
            </h2>
            <p className="text-sm text-white/85 font-medium mt-1 line-clamp-2">
              {t("urgency.endsSoon", { title: campaign.title })}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 md:gap-3 shrink-0" role="timer" aria-label={t("urgency.timeLeft")}>
          {[
            { label: t("urgency.days"), value: days },
            { label: t("urgency.hours"), value: pad(hours) },
            { label: t("urgency.min"), value: pad(minutes) },
            { label: t("urgency.seg"), value: pad(seconds) },
          ].map((chip) => (
            <div
              key={chip.label}
              className="flex flex-col items-center rounded-2xl bg-white/15 backdrop-blur-sm border border-white/25 px-3 py-2 min-w-[3.5rem]"
            >
              <span className="font-display text-2xl font-bold tabular-nums leading-none">{chip.value}</span>
              <span className="text-[10px] font-bold uppercase tracking-wider text-white/80 mt-1">
                {chip.label}
              </span>
            </div>
          ))}
        </div>

        <div className="shrink-0">
          <Link href={`/campanas/${campaign.id}`}>
            <Button
              variant="default"
              size="lg"
              className="w-full md:w-auto rounded-2xl bg-white text-red-600 border-white hover:bg-red-50 font-bold shadow-lg"
            >
              {t("urgency.supportNow")} <ArrowRight className="w-5 h-5" />
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

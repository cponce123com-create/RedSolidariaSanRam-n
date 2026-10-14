import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Building2, Globe, Star, ArrowRight } from "lucide-react";
import { optimizeImageUrl } from "@/lib/image-url";
import {
  ALLY_TYPE_COLORS,
  ALLY_TYPE_LABELS,
  fetchAllies,
  sortAllies,
  type Ally,
} from "@/lib/allies";

/**
 * Franja de aliados y patrocinadores para la página del evento (Fase 6).
 *
 * Reutiliza el MISMO módulo de aliados que `/aliados` (`@/lib/allies`): no hay
 * modelo ni datos duplicados. Muestra los aliados reales, destacados primero, y
 * si no hay ninguno explica que se publicarán próximamente en lugar de un
 * marcador de posición vacío.
 */
export function AlliesStrip() {
  const { t } = useTranslation();
  const { data: allies = [], isLoading } = useQuery<Ally[]>({
    queryKey: ["/api/allies"],
    queryFn: fetchAllies,
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, index) => (
          <div key={index} className="h-32 rounded-2xl bg-secondary/40 animate-pulse" />
        ))}
      </div>
    );
  }

  const ordered = sortAllies(allies);

  if (ordered.length === 0) {
    return (
      <div className="bg-secondary/30 rounded-2xl p-6 text-center border border-dashed border-border text-muted-foreground text-sm">
        {t("chocofest.emptyAllies")}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {ordered.map((ally) => (
          <div
            key={ally.id}
            className={`bg-card border rounded-2xl p-4 flex flex-col items-center gap-2 text-center shadow-sm ${
              ally.featured ? "border-primary/30 ring-1 ring-primary/20" : "border-border"
            }`}
          >
            {ally.featured && <Star className="w-3.5 h-3.5 fill-primary text-primary" />}
            <div className="w-16 h-16 rounded-xl bg-secondary flex items-center justify-center overflow-hidden">
              {ally.logo ? (
                <img
                  src={optimizeImageUrl(ally.logo, { width: 160 })}
                  alt={ally.name}
                  loading="lazy"
                  decoding="async"
                  className="w-full h-full object-contain p-1.5"
                />
              ) : (
                <Building2 className="w-7 h-7 text-muted-foreground opacity-30" />
              )}
            </div>
            <span
              className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                ALLY_TYPE_COLORS[ally.type] ?? "bg-secondary text-foreground"
              }`}
            >
              {ALLY_TYPE_LABELS[ally.type] ? t(ALLY_TYPE_LABELS[ally.type]) : ally.type}
            </span>
            <p className="font-semibold text-sm leading-tight text-foreground">{ally.name}</p>
            {ally.website && (
              <a
                href={ally.website}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary text-xs font-medium hover:underline inline-flex items-center gap-1"
              >
                <Globe className="w-3 h-3" /> {t("allies.visitWebsite")}
              </a>
            )}
          </div>
        ))}
      </div>
      <div className="text-center">
        <Link href="/aliados">
          <Button variant="outline" className="rounded-2xl">
            {t("chocofest.ctaAllies")} <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </Link>
      </div>
    </div>
  );
}

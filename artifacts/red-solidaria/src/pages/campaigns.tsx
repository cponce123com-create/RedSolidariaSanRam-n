import { lazy, Suspense, useState } from "react";
import { useGetCampaigns } from "@workspace/api-client-react";
import { CampaignCard } from "@/components/shared/CampaignCard";
import { EmptyState } from "@/components/shared/EmptyState";
import { UrgencyBanner } from "@/components/shared/UrgencyBanner";
import { Button } from "@/components/ui/button";
import { Package, Map as MapIcon, LayoutGrid } from "lucide-react";
import { isUrgent, mostUrgentCampaign } from "@/lib/campaign-urgency";
import { useTranslation } from "react-i18next";
import SEO from "@/components/shared/SEO";

// Leaflet se carga solo al usar el mapa (chunk separado ~150 KB)
const CampaignMap = lazy(() => import("@/components/shared/CampaignMap"));

export default function Campaigns() {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<"all" | "active" | "completed">("all");
  const [view, setView] = useState<"grid" | "map">("grid");
  
  // Using generated hook from Orval
  const { data: campaigns, isLoading } = useGetCampaigns({ status: filter === "all" ? undefined : filter });

  // Fase 3 (modo emergencia): la campaña activa que cierra más pronto se
  // destaca con un banner y countdown por encima de la grilla/mapa.
  const urgentCampaigns = (campaigns ?? []).filter((c) => isUrgent(c));
  const topUrgent = mostUrgentCampaign(urgentCampaigns);

  return (
    <div className="min-h-screen pt-20 bg-background">
      <SEO
        title={t("campaigns.seoTitle")}
        description={t("campaigns.seoDescription")}
        url="/campanas"
      />
      <section className="py-12 bg-secondary/30 border-b border-border/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl md:text-5xl font-display font-bold mb-6">{t("campaigns.title")}</h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            {t("campaigns.subtitle")}
          </p>
          
          <div className="flex flex-wrap justify-center gap-3 mt-10">
            <Button 
              variant={filter === "all" ? "default" : "outline"}
              onClick={() => setFilter("all")}
              className="rounded-full px-6"
            >
              {t("campaigns.filterAll")}
            </Button>
            <Button 
              variant={filter === "active" ? "default" : "outline"}
              onClick={() => setFilter("active")}
              className="rounded-full px-6"
            >
              {t("campaigns.filterActive")}
            </Button>
            <Button 
              variant={filter === "completed" ? "default" : "outline"}
              onClick={() => setFilter("completed")}
              className="rounded-full px-6"
            >
              {t("campaigns.filterCompleted")}
            </Button>
          </div>

          {/* Toggle Grilla / Mapa (fase 2 del rediseño) */}
          <div className="flex justify-center gap-2 mt-6" role="group" aria-label={t("campaigns.viewAria")}>
            <Button
              variant={view === "grid" ? "default" : "outline"}
              size="sm"
              onClick={() => setView("grid")}
              className="rounded-full gap-2 px-5"
              aria-pressed={view === "grid"}
            >
              <LayoutGrid className="w-4 h-4" /> {t("campaigns.viewGrid")}
            </Button>
            <Button
              variant={view === "map" ? "default" : "outline"}
              size="sm"
              onClick={() => setView("map")}
              className="rounded-full gap-2 px-5"
              aria-pressed={view === "map"}
            >
              <MapIcon className="w-4 h-4" /> {t("campaigns.viewMap")}
            </Button>
          </div>
        </div>
      </section>

      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {topUrgent && filter !== "completed" && (
            <UrgencyBanner campaign={topUrgent} variant="compact" className="mb-10" />
          )}
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {[1,2,3,4,5,6].map(i => (
                <div key={i} className="h-96 bg-muted animate-pulse rounded-2xl" />
              ))}
            </div>
          ) : view === "map" ? (
            <Suspense fallback={<div className="h-[520px] bg-muted animate-pulse rounded-3xl" />}>
              <CampaignMap campaigns={campaigns ?? []} />
            </Suspense>
          ) : campaigns && campaigns.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {campaigns.map(campaign => (
                <CampaignCard key={campaign.id} campaign={campaign} />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={Package}
              title={t("campaigns.emptyTitle")}
              description={t("campaigns.emptyDescription")}
            />
          )}
        </div>
      </section>
    </div>
  );
}

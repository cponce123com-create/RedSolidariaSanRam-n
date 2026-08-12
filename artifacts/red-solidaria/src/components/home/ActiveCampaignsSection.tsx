import { motion } from "framer-motion";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { ArrowRight, HeartHandshake } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useGetCampaigns } from "@workspace/api-client-react";
import { CampaignCard } from "@/components/shared/CampaignCard";
import { Skeleton } from "@/lib/Skeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import { SectionContainer, SectionHeading } from "./SectionHeading";

/**
 * "Personas que hoy necesitan de nosotros" — campañas reales del sistema.
 * Prioriza destacadas; si no hay, muestra las primeras activas.
 */
export function ActiveCampaignsSection() {
  const { t } = useTranslation();

  const featured = useGetCampaigns({ featured: true, status: "active" });
  const active = useGetCampaigns({ status: "active" });

  const loading = featured.isLoading || active.isLoading;
  const campaigns =
    featured.data && featured.data.length > 0
      ? featured.data.slice(0, 3)
      : (active.data ?? []).slice(0, 3);

  return (
    <SectionContainer className="bg-background">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <SectionHeading
          title={t("home.campaignsSectionTitle")}
          subtitle={t("home.campaignsSectionSubtitle")}
        />
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="shrink-0"
        >
          <Button
            asChild
            variant="ghost"
            className="text-primary hover:bg-secondary/70 hover:text-primary"
          >
            <Link href="/campanas">
              {t("home.featuredViewAll")}
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </Link>
          </Button>
        </motion.div>
      </div>

      <div className="mt-10">
        {loading ? (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="space-y-3 rounded-2xl border border-border/60 bg-card p-5"
              >
                <Skeleton className="h-48 w-full rounded-xl" />
                <Skeleton className="h-5 w-2/3" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-4/5" />
                <Skeleton className="h-9 w-full rounded-xl" />
              </div>
            ))}
          </div>
        ) : campaigns.length > 0 ? (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {campaigns.map((campaign, i) => (
              <motion.div
                key={campaign.id}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.5, delay: i * 0.1 }}
              >
                <CampaignCard campaign={campaign} showLocation />
              </motion.div>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={HeartHandshake}
            title={t("home.campaignsEmptyTitle")}
            description={t("home.campaignsEmptyDesc")}
            action={
              <Button asChild>
                <Link href="/como-ayudar">{t("home.campaignsEmptyCta")}</Link>
              </Button>
            }
          />
        )}
      </div>
    </SectionContainer>
  );
}

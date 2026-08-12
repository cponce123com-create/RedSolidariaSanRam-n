import { motion } from "framer-motion";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { ArrowRight, MapPin } from "lucide-react";
import { useGetCampaigns } from "@workspace/api-client-react";
import CampaignMap, { type MappableCampaign } from "@/components/shared/CampaignMap";
import { SectionContainer, SectionHeading } from "./SectionHeading";

/**
 * "Estamos en nuestra comunidad" — reutiliza el mapa existente (CampaignMap)
 * con las campañas que tienen coordenadas. Se oculta si no hay ninguna.
 */
export function CommunityMapSection() {
  const { t } = useTranslation();

  const { data: campaigns } = useGetCampaigns();

  const located = (campaigns ?? []).filter((c) => {
    const m = c as unknown as Partial<MappableCampaign>;
    return typeof m.latitude === "number" && typeof m.longitude === "number";
  }) as MappableCampaign[];

  if (located.length === 0) return null;

  return (
    <SectionContainer className="bg-background">
      <SectionHeading title={t("home.mapSectionTitle")} subtitle={t("home.mapSectionSubtitle")} />

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.55, delay: 0.1 }}
        className="mt-10"
      >
        <div className="overflow-hidden rounded-3xl border border-border/60 shadow-md">
          <CampaignMap campaigns={located} className="h-[400px] sm:h-[440px]" />
        </div>
        <div className="mt-4 flex items-center justify-between gap-4">
          <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
            <MapPin className="h-4 w-4 text-primary" />
            {t("home.campaignsLocation")}
          </p>
          <Link
            href="/campanas"
            className="group inline-flex items-center gap-1.5 text-sm font-semibold text-primary underline-offset-4 hover:underline"
          >
            {t("home.mapViewAll")}
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </motion.div>
    </SectionContainer>
  );
}

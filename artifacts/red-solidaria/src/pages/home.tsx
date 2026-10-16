import { lazy, Suspense } from "react";
import { useTranslation } from "react-i18next";
import SEO from "@/components/shared/SEO";
import { buildSiteJsonLd } from "@/lib/structured-data";
import { InstitutionalCover } from "@/components/home/InstitutionalCover";
import { HomeHero } from "@/components/home/HomeHero";
import { HowToHelpSection } from "@/components/home/HowToHelpSection";
import { ActiveCampaignsSection } from "@/components/home/ActiveCampaignsSection";
import { TransparencySection } from "@/components/home/TransparencySection";
import { StorySection } from "@/components/home/StorySection";
import { VolunteerSection } from "@/components/home/VolunteerSection";
import { FinalCtaSection } from "@/components/home/FinalCtaSection";
import { ProtagonistCampaignSection } from "@/components/home/ProtagonistCampaignSection";

// Secciones con datos pesados (mapa/Leaflet y listados) → lazy para no inflar
// el bundle principal del home.
const UrgentCasesSection = lazy(() =>
  import("@/components/home/UrgentCasesSection").then((m) => ({ default: m.UrgentCasesSection }))
);
const CommunityMapSection = lazy(() =>
  import("@/components/home/CommunityMapSection").then((m) => ({ default: m.CommunityMapSection }))
);
const AdoptionsSection = lazy(() =>
  import("@/components/home/AdoptionsSection").then((m) => ({ default: m.AdoptionsSection }))
);

/**
 * Página de inicio — centro de acción de la red.
 *
 * Jerarquía (respuesta en <5s):
 *  0. Portada institucional (solo si está configurada y publicada)
 *  1. Qué es → Hero
 *  2. Cómo puedo ayudar → HowToHelpSection
 *  3. Personas que necesitan → ActiveCampaignsSection (+ casos urgentes)
 *  4. Transparencia → TransparencySection
 *  5. Quiénes somos → StorySection
 *  6. Comunidad → CommunityMapSection
 *  7. Mascotas → AdoptionsSection
 *  8. Voluntariado → VolunteerSection
 *  9. Cierre → FinalCtaSection
 *
 * Todos los datos provienen del backend existente; sin cifras inventadas.
 */
export default function Home() {
  const { t } = useTranslation();

  return (
    <>
      <SEO
        title={t("seo.siteName")}
        description={t("seo.defaultDescription")}
        jsonLd={buildSiteJsonLd({
          siteName: t("seo.siteName"),
          description: t("seo.defaultDescription"),
        })}
      />

      {/* Portada institucional administrable: no renderiza nada si no hay
          contenido publicado, así el home nunca se rompe por falta de identidad. */}
      <InstitutionalCover />
      <HomeHero />
      {/* Campaña protagonista (ChocoFest 2026): solo si está configurada,
          publicada y activa. Si no, no renderiza nada y la portada general
          se mantiene igual. */}
      <ProtagonistCampaignSection />
      <HowToHelpSection />
      <ActiveCampaignsSection />
      <Suspense fallback={null}>
        <UrgentCasesSection />
      </Suspense>
      <TransparencySection />
      <StorySection />
      <Suspense fallback={null}>
        <CommunityMapSection />
      </Suspense>
      <Suspense fallback={null}>
        <AdoptionsSection />
      </Suspense>
      <VolunteerSection />
      <FinalCtaSection />
    </>
  );
}

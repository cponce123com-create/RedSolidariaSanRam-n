import { lazy, Suspense } from "react";
import { useTranslation } from "react-i18next";
import SEO from "@/components/shared/SEO";
import { HomeHero } from "@/components/home/HomeHero";
import { HowToHelpSection } from "@/components/home/HowToHelpSection";
import { ActiveCampaignsSection } from "@/components/home/ActiveCampaignsSection";
import { TransparencySection } from "@/components/home/TransparencySection";
import { StorySection } from "@/components/home/StorySection";
import { VolunteerSection } from "@/components/home/VolunteerSection";
import { FinalCtaSection } from "@/components/home/FinalCtaSection";

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
      <SEO title={t("seo.siteName")} description={t("seo.defaultDescription")} />

      <HomeHero />
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

import { motion } from "framer-motion";
import { Shield, Target, Heart, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import SEO from "@/components/shared/SEO";
import { useInstitutionalIdentity } from "@/hooks/use-institutional-identity";
import { optimizeImageUrl } from "@/lib/image-url";

const FALLBACK_HISTORY_IMAGE =
  "https://images.unsplash.com/photo-1559027615-cd4628902d4a?w=800&q=80";

/**
 * Página pública «Nosotros» (Fase 3).
 *
 * Consume la identidad institucional PUBLICADA (`GET /api/institutional-identity`)
 * y cae a los textos i18n originales cuando el módulo no está publicado: el
 * contenido administrable es una MEJORA, no un requisito para que la página
 * funcione.
 */
export default function About() {
  const { t } = useTranslation();
  const { data: identity } = useInstitutionalIdentity();

  const pageTitle = identity?.hero.title || t("about.title");
  const pageSubtitle = identity?.hero.subtitle || t("about.subtitle");

  const storyTitle = identity?.story.title || t("about.historyTitle");
  const storySubtitle = identity?.story.subtitle || "";
  const historyHtml = identity?.story.html || "";

  const mission = identity?.mission || t("about.missionText");
  const vision = identity?.vision || t("about.visionText");
  const values =
    identity && identity.values.length > 0
      ? identity.values
      : [
          { title: t("about.valueTransparency"), description: "" },
          { title: t("about.valueEmpathy"), description: "" },
          { title: t("about.valueTeamwork"), description: "" },
          { title: t("about.valueCommitment"), description: "" },
        ];

  const firstPhoto = identity?.story.photos?.[0];
  const historyImage = firstPhoto
    ? optimizeImageUrl(firstPhoto, { width: 800 })
    : FALLBACK_HISTORY_IMAGE;

  return (
    <div className="min-h-screen pt-20 bg-background">
      <SEO
        title={storyTitle || t("about.seoTitle")}
        description={pageSubtitle || t("about.seoDescription")}
        url="/nosotros"
      />

      {/* HEADER */}
      <section className="py-20 bg-secondary/30 border-b border-border/50 text-center px-4">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-4xl md:text-5xl font-display font-bold mb-6">{pageTitle}</h1>
          <p className="text-xl text-muted-foreground leading-relaxed">{pageSubtitle}</p>
        </div>
      </section>

      {/* HISTORY */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid md:grid-cols-2 gap-12 items-center">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            className="space-y-6"
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary font-medium text-sm">
              <Heart className="w-4 h-4" /> {t("about.historyBadge")}
            </div>
            <h2 className="text-3xl md:text-4xl font-display font-bold">{storyTitle}</h2>
            {storySubtitle && (
              <p className="text-lg font-medium text-foreground">{storySubtitle}</p>
            )}
            {historyHtml ? (
              <div
                className="text-lg text-muted-foreground leading-relaxed space-y-4 [&_h2]:font-display [&_h2]:text-2xl [&_h2]:font-bold [&_h2]:text-foreground [&_h3]:font-semibold [&_h3]:text-foreground [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_a]:text-primary [&_a]:underline"
                // El HTML ya viene saneado por el servidor (lib/rich-text.ts).
                dangerouslySetInnerHTML={{ __html: historyHtml }}
              />
            ) : (
              <>
                <p className="text-lg text-muted-foreground leading-relaxed">{t("about.historyP1")}</p>
                <p className="text-lg text-muted-foreground leading-relaxed">{t("about.historyP2")}</p>
              </>
            )}
          </motion.div>
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            className="relative h-[400px] rounded-3xl overflow-hidden shadow-2xl"
          >
            <img
              src={historyImage}
              alt={t("about.volunteersAlt")}
              loading="lazy"
              decoding="async"
              className="w-full h-full object-cover"
            />
          </motion.div>
        </div>
      </section>

      {/* MISIÓN / VISIÓN / VALORES */}
      <section className="py-20 bg-primary text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid md:grid-cols-3 gap-8">
          <div className="bg-card/10 p-8 rounded-2xl backdrop-blur-sm border border-white/20">
            <Target className="w-12 h-12 mb-6 text-white/90" />
            <h3 className="text-2xl font-display font-bold mb-4">{t("about.mission")}</h3>
            <p className="text-white/80 leading-relaxed whitespace-pre-line">{mission}</p>
          </div>
          <div className="bg-card/10 p-8 rounded-2xl backdrop-blur-sm border border-white/20">
            <Shield className="w-12 h-12 mb-6 text-white/90" />
            <h3 className="text-2xl font-display font-bold mb-4">{t("about.vision")}</h3>
            <p className="text-white/80 leading-relaxed whitespace-pre-line">{vision}</p>
          </div>
          <div className="bg-card/10 p-8 rounded-2xl backdrop-blur-sm border border-white/20">
            <Users className="w-12 h-12 mb-6 text-white/90" />
            <h3 className="text-2xl font-display font-bold mb-4">{t("about.values")}</h3>
            <ul className="space-y-2 text-white/80">
              {values.map((value, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span aria-hidden>•</span>
                  <span>
                    <span className="font-medium">{value.title}</span>
                    {value.description ? ` — ${value.description}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}

import { motion } from "framer-motion";
import { Shield, Target, Heart, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import SEO from "@/components/shared/SEO";

export default function About() {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen pt-20 bg-background">
      <SEO
        title={t("about.seoTitle")}
        description={t("about.seoDescription")}
        url="/nosotros"
      />
      {/* HEADER */}
      <section className="py-20 bg-secondary/30 border-b border-border/50 text-center px-4">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-4xl md:text-5xl font-display font-bold mb-6">{t("about.title")}</h1>
          <p className="text-xl text-muted-foreground leading-relaxed">
            {t("about.subtitle")}
          </p>
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
            <h2 className="text-3xl md:text-4xl font-display font-bold">{t("about.historyTitle")}</h2>
            <p className="text-lg text-muted-foreground leading-relaxed">
              {t("about.historyP1")}
            </p>
            <p className="text-lg text-muted-foreground leading-relaxed">
              {t("about.historyP2")}
            </p>
          </motion.div>
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            className="relative h-[400px] rounded-3xl overflow-hidden shadow-2xl"
          >
            {/* volunteers smiling working */}
            <img 
              src="https://images.unsplash.com/photo-1559027615-cd4628902d4a?w=800&q=80" 
              alt={t("about.volunteersAlt")} 
              className="w-full h-full object-cover"
            />
          </motion.div>
        </div>
      </section>

      {/* M/V/V */}
      <section className="py-20 bg-primary text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid md:grid-cols-3 gap-8">
          <div className="bg-card/10 p-8 rounded-2xl backdrop-blur-sm border border-white/20">
            <Target className="w-12 h-12 mb-6 text-white/90" />
            <h3 className="text-2xl font-display font-bold mb-4">{t("about.mission")}</h3>
            <p className="text-white/80 leading-relaxed">
              {t("about.missionText")}
            </p>
          </div>
          <div className="bg-card/10 p-8 rounded-2xl backdrop-blur-sm border border-white/20">
            <Shield className="w-12 h-12 mb-6 text-white/90" />
            <h3 className="text-2xl font-display font-bold mb-4">{t("about.vision")}</h3>
            <p className="text-white/80 leading-relaxed">
              {t("about.visionText")}
            </p>
          </div>
          <div className="bg-card/10 p-8 rounded-2xl backdrop-blur-sm border border-white/20">
            <Users className="w-12 h-12 mb-6 text-white/90" />
            <h3 className="text-2xl font-display font-bold mb-4">{t("about.values")}</h3>
            <ul className="space-y-2 text-white/80">
              <li className="flex items-center gap-2">{t("about.valueTransparency")}</li>
              <li className="flex items-center gap-2">{t("about.valueEmpathy")}</li>
              <li className="flex items-center gap-2">{t("about.valueTeamwork")}</li>
              <li className="flex items-center gap-2">{t("about.valueCommitment")}</li>
            </ul>
          </div>
        </div>
      </section>
      
    </div>
  );
}

import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import {
  Dog, Cat, Heart, Shield, Syringe, Home, HandHeart, AlertTriangle,
  ArrowRight, Leaf, Sun, Users, PawPrint
} from "lucide-react";

// Los valores de texto son claves i18n: se traducen con t() en el render.
const WELFARE_SECTIONS = [
  {
    icon: Dog,
    color: "from-amber-50 to-orange-50 border-amber-200",
    iconColor: "text-amber-600",
    badgeKey: "animalWelfare.section1Badge",
    badgeColor: "bg-amber-100 text-amber-700",
    titleKey: "animalWelfare.section1Title",
    descKey: "animalWelfare.section1Desc",
    stats: [
      { value: "80+", labelKey: "animalWelfare.section1Stat1" },
      { value: "12", labelKey: "animalWelfare.section1Stat2" },
    ],
    ctaKey: "animalWelfare.section1Cta",
    ctaHref: "/campanas",
  },
  {
    icon: Home,
    color: "from-blue-50 to-indigo-50 border-blue-200",
    iconColor: "text-blue-600",
    badgeKey: "animalWelfare.section2Badge",
    badgeColor: "bg-blue-100 text-blue-700",
    titleKey: "animalWelfare.section2Title",
    descKey: "animalWelfare.section2Desc",
    stats: [
      { value: "3", labelKey: "animalWelfare.section2Stat1" },
      { value: "150+", labelKey: "animalWelfare.section2Stat2" },
    ],
    ctaKey: "animalWelfare.section2Cta",
    ctaHref: "/campanas",
  },
  {
    icon: Syringe,
    color: "from-green-50 to-emerald-50 border-green-200",
    iconColor: "text-green-600",
    badgeKey: "animalWelfare.section3Badge",
    badgeColor: "bg-green-100 text-green-700",
    titleKey: "animalWelfare.section3Title",
    descKey: "animalWelfare.section3Desc",
    stats: [
      { value: "200+", labelKey: "animalWelfare.section3Stat1" },
      { value: "85+", labelKey: "animalWelfare.section3Stat2" },
    ],
    ctaKey: "animalWelfare.section3Cta",
    ctaHref: "/noticias",
  },
  {
    icon: AlertTriangle,
    color: "from-red-50 to-rose-50 border-red-200",
    iconColor: "text-red-600",
    badgeKey: "animalWelfare.section4Badge",
    badgeColor: "bg-red-100 text-red-700",
    titleKey: "animalWelfare.section4Title",
    descKey: "animalWelfare.section4Desc",
    stats: [
      { value: "60+", labelKey: "animalWelfare.section4Stat1" },
      { value: "48h", labelKey: "animalWelfare.section4Stat2" },
    ],
    ctaKey: "animalWelfare.section4Cta",
    ctaHref: "/reportar",
  },
];

const AWARENESS_MSGS = [
  {
    icon: Shield,
    titleKey: "animalWelfare.aware1Title",
    descKey: "animalWelfare.aware1Desc",
  },
  {
    icon: Leaf,
    titleKey: "animalWelfare.aware2Title",
    descKey: "animalWelfare.aware2Desc",
  },
  {
    icon: Sun,
    titleKey: "animalWelfare.aware3Title",
    descKey: "animalWelfare.aware3Desc",
  },
  {
    icon: Heart,
    titleKey: "animalWelfare.aware4Title",
    descKey: "animalWelfare.aware4Desc",
  },
];

export default function AnimalWelfare() {
  const { t } = useTranslation();

  return (
    <div className="max-w-6xl mx-auto px-4 pt-24 sm:pt-28 pb-10 sm:pb-16">
      {/* Hero */}
      <div className="mb-14">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-3 bg-amber-100 rounded-2xl"><PawPrint className="w-7 h-7 text-amber-600" /></div>
          <span className="bg-amber-100 text-amber-700 text-sm font-bold px-3 py-1 rounded-full uppercase tracking-wider">{t("animalWelfare.badge")}</span>
        </div>
        <h1 className="text-4xl sm:text-5xl font-display font-black mb-4">{t("animalWelfare.heroTitle")}</h1>
        <p className="text-muted-foreground text-lg max-w-2xl leading-relaxed">
          {t("animalWelfare.heroSubtitle")}
        </p>
        <div className="flex flex-col sm:flex-row gap-4 mt-8">
          <Link href="/adopciones">
            <Button className="rounded-2xl h-12 px-6 bg-amber-500 hover:bg-amber-600 shadow-md hover-elevate">
              <Dog className="w-4 h-4 mr-2" /> {t("animalWelfare.viewAdoptedPets")}
            </Button>
          </Link>
          <Link href="/reportar">
            <Button variant="outline" className="rounded-2xl h-12 px-6 border-red-200 text-red-600 hover:bg-red-50">
              <AlertTriangle className="w-4 h-4 mr-2" /> {t("animalWelfare.reportAnimal")}
            </Button>
          </Link>
        </div>
      </div>

      {/* Welfare sections */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-16">
        {WELFARE_SECTIONS.map((section, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.1 }}
            className={`bg-gradient-to-br ${section.color} border rounded-3xl p-7 flex flex-col gap-4`}
          >
            <div className="flex items-start justify-between">
              <div className={`p-3 bg-card/70 rounded-2xl`}>
                <section.icon className={`w-7 h-7 ${section.iconColor}`} />
              </div>
              <span className={`text-xs font-bold px-3 py-1 rounded-full ${section.badgeColor}`}>{t(section.badgeKey)}</span>
            </div>

            <div>
              <h3 className="font-display font-bold text-xl mb-2">{t(section.titleKey)}</h3>
              <p className="text-muted-foreground leading-relaxed text-sm">{t(section.descKey)}</p>
            </div>

            <div className="flex gap-6">
              {section.stats.map((stat, j) => (
                <div key={j}>
                  <p className="text-2xl font-display font-bold">{stat.value}</p>
                  <p className="text-xs text-muted-foreground">{t(stat.labelKey)}</p>
                </div>
              ))}
            </div>

            <Link href={section.ctaHref}>
              <Button
                size="sm"
                className={`rounded-xl h-9 mt-auto bg-card/80 hover:bg-card text-foreground border border-white/50 shadow-sm gap-1.5`}
              >
                {t(section.ctaKey)} <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </Link>
          </motion.div>
        ))}
      </div>

      {/* Adopción responsable CTA */}
      <div className="bg-gradient-to-br from-amber-400 to-orange-500 rounded-3xl p-8 sm:p-12 text-white text-center mb-16 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <Dog className="absolute -left-8 -bottom-8 w-64 h-64" />
          <Cat className="absolute -right-8 -top-8 w-48 h-48" />
        </div>
        <div className="relative z-10">
          <PawPrint className="w-14 h-14 mx-auto mb-5 opacity-90" />
          <h2 className="text-3xl sm:text-4xl font-display font-black mb-4">{t("animalWelfare.adoptCtaTitle")}</h2>
          <p className="text-white/90 text-lg mb-8 max-w-2xl mx-auto">
            {t("animalWelfare.adoptCtaDesc")}
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/adopciones">
              <Button size="lg" className="bg-card text-amber-700 hover:bg-card/90 rounded-2xl h-14 px-10 font-bold shadow-xl">
                <Heart className="w-5 h-5 mr-2" /> {t("animalWelfare.adoptCtaButton")}
              </Button>
            </Link>
            <Link href="/publicar-mascota">
              <Button size="lg" variant="outline" className="border-white text-white hover:bg-card/20 rounded-2xl h-14 px-10 font-semibold">
                {t("animalWelfare.adoptCtaPublish")}
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Mensajes de concientización */}
      <div className="mb-16">
        <h2 className="text-3xl font-display font-bold mb-3 text-center">{t("animalWelfare.awarenessTitle")}</h2>
        <p className="text-muted-foreground text-center mb-10">{t("animalWelfare.awarenessSubtitle")}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {AWARENESS_MSGS.map((msg, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className="bg-card border border-border rounded-3xl p-6 flex flex-col items-center text-center gap-3"
            >
              <div className="w-14 h-14 bg-primary/10 rounded-full flex items-center justify-center">
                <msg.icon className="w-7 h-7 text-primary" />
              </div>
              <h3 className="font-display font-bold text-base">{t(msg.titleKey)}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">{t(msg.descKey)}</p>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Cómo ayudar */}
      <div className="bg-secondary/30 rounded-3xl p-8 text-center">
        <h3 className="font-display font-bold text-2xl mb-2">{t("howToHelp.title")}</h3>
        <p className="text-muted-foreground mb-8">{t("animalWelfare.helpSubtitle")}</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 text-left mb-8">
          {[
            { icon: HandHeart, titleKey: "animalWelfare.helpVolunteer", descKey: "animalWelfare.helpVolunteerDesc", href: "/contacto" },
            { icon: Users, titleKey: "animalWelfare.helpFoster", descKey: "animalWelfare.helpFosterDesc", href: "/contacto" },
            { icon: Heart, titleKey: "nav.donate", descKey: "animalWelfare.helpDonateDesc", href: "/campanas" },
          ].map((item, i) => (
            <Link href={item.href} key={i}>
              <div className="bg-card border border-border rounded-2xl p-5 hover:shadow-md transition-shadow cursor-pointer h-full">
                <item.icon className="w-7 h-7 text-primary mb-3" />
                <h4 className="font-bold mb-1">{t(item.titleKey)}</h4>
                <p className="text-muted-foreground text-sm leading-relaxed">{t(item.descKey)}</p>
              </div>
            </Link>
          ))}
        </div>
        <Link href="/contacto">
          <Button className="rounded-2xl px-8 h-12">
            {t("animalWelfare.volunteerCta")} <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </Link>
      </div>
    </div>
  );
}

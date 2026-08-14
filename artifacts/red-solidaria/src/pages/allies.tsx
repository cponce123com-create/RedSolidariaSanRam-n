import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { optimizeImageUrl } from "@/lib/image-url";
import { motion } from "framer-motion";
import {
  Building2, Star, Globe, ArrowRight, HandHeart, Users,
  Heart, Sparkles
} from "lucide-react";

interface Ally {
  id: number; name: string; type: string; logo: string | null;
  description: string | null; website: string | null;
  featured: boolean; active: boolean;
}

// Los valores de texto son claves i18n: los etiquetados se traducen con t() en el render.
const TYPE_LABELS: Record<string, string> = {
  empresa: "allies.typeEmpresa",
  emprendimiento: "allies.typeEmprendimiento",
  institucion: "allies.typeInstitucion",
  persona: "allies.typePersona",
  ong: "allies.typeOng",
};

const TYPE_COLORS: Record<string, string> = {
  empresa: "bg-blue-100 text-blue-700",
  emprendimiento: "bg-green-100 text-green-700",
  institucion: "bg-purple-100 text-purple-700",
  persona: "bg-rose-100 text-rose-700",
  ong: "bg-amber-100 text-amber-700",
};

function AllyCard({ ally, featured = false }: { ally: Ally; featured?: boolean }) {
  const { t } = useTranslation();

  return (
    <motion.div
      whileHover={{ y: -3 }}
      className={`bg-card border rounded-3xl p-6 flex flex-col gap-4 shadow-sm hover:shadow-md transition-all ${featured ? "border-primary/30 ring-1 ring-primary/20" : "border-border"}`}
    >
      {featured && (
        <div className="flex items-center gap-1.5 text-xs text-primary font-bold">
          <Star className="w-3.5 h-3.5 fill-primary" /> {t("allies.featuredBadge")}
        </div>
      )}
      {/* Logo */}
      <div className="w-20 h-20 rounded-2xl bg-secondary flex items-center justify-center overflow-hidden mx-auto">
        {ally.logo ? (
          <img src={optimizeImageUrl(ally.logo, { width: 200 })} alt={ally.name} loading="lazy" decoding="async" className="w-full h-full object-contain p-2" />
        ) : (
          <Building2 className="w-10 h-10 text-muted-foreground opacity-30" />
        )}
      </div>
      <div className="text-center">
        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${TYPE_COLORS[ally.type] || "bg-secondary text-foreground"}`}>
          {TYPE_LABELS[ally.type] ? t(TYPE_LABELS[ally.type]) : ally.type}
        </span>
        <h3 className="font-display font-bold text-xl mt-2 mb-1">{ally.name}</h3>
        {ally.description && <p className="text-muted-foreground text-sm leading-relaxed">{ally.description}</p>}
      </div>
      {ally.website && (
        <a href={ally.website} target="_blank" rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 text-primary text-sm font-medium hover:underline mt-auto">
          <Globe className="w-4 h-4" /> {t("allies.visitWebsite")}
        </a>
      )}
    </motion.div>
  );
}

// Los valores de texto son claves i18n: los etiquetados se traducen con t() en el render.
const HOW_TO_ALLY = [
  {
    icon: Sparkles,
    titleKey: "allies.how1Title",
    descKey: "allies.how1Desc",
  },
  {
    icon: HandHeart,
    titleKey: "allies.how2Title",
    descKey: "allies.how2Desc",
  },
  {
    icon: Users,
    titleKey: "allies.how3Title",
    descKey: "allies.how3Desc",
  },
  {
    icon: Heart,
    titleKey: "allies.how4Title",
    descKey: "allies.how4Desc",
  },
];

const ALLY_BENEFITS = [
  "allies.benefit1",
  "allies.benefit2",
  "allies.benefit3",
  "allies.benefit4",
  "allies.benefit5",
  "allies.benefit6",
];

export default function Allies() {
  const { t } = useTranslation();
  const { data: allies = [], isLoading } = useQuery<Ally[]>({
    queryKey: ["/api/allies"],
    queryFn: async () => {
      const res = await fetch("/api/allies");
      if (!res.ok) throw new Error("Error");
      return res.json();
    },
  });

  const featured = allies.filter(a => a.featured);
  const regular = allies.filter(a => !a.featured);

  return (
    <div className="max-w-6xl mx-auto px-4 pt-24 sm:pt-28 pb-10 sm:pb-16">
      {/* Hero */}
      <div className="mb-14 text-center max-w-3xl mx-auto">
        <div className="flex items-center gap-3 mb-5 justify-center">
          <div className="p-3 bg-primary/10 rounded-2xl"><Building2 className="w-7 h-7 text-primary" /></div>
          <span className="bg-primary/10 text-primary text-sm font-bold px-3 py-1 rounded-full uppercase tracking-wider">{t("allies.badge")}</span>
        </div>
        <h1 className="text-4xl sm:text-5xl font-display font-black mb-4">{t("allies.title")}</h1>
        <p className="text-muted-foreground text-lg leading-relaxed">
          {t("allies.subtitle")}
        </p>
        <Link href="/contacto">
          <Button className="mt-6 rounded-2xl h-12 px-8 shadow-md hover-elevate">
            <Building2 className="w-4 h-4 mr-2" /> {t("allies.becomeAlly")}
          </Button>
        </Link>
      </div>

      {/* Allies list */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-14">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-card border border-border rounded-3xl h-52 animate-pulse" />
          ))}
        </div>
      ) : allies.length === 0 ? (
        <div className="text-center py-16 mb-14">
          <Building2 className="w-16 h-16 text-muted-foreground opacity-20 mx-auto mb-4" />
          <h3 className="font-bold text-xl mb-2">{t("allies.emptyTitle")}</h3>
          <p className="text-muted-foreground max-w-sm mx-auto">{t("allies.emptyDesc")}</p>
          <Link href="/contacto">
            <Button className="mt-5 rounded-xl">{t("howToHelp.productsCta")}</Button>
          </Link>
        </div>
      ) : (
        <>
          {featured.length > 0 && (
            <div className="mb-12">
              <h2 className="text-2xl font-display font-bold mb-6 flex items-center gap-2">
                <Star className="w-6 h-6 text-primary fill-primary" /> {t("allies.featuredTitle")}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {featured.map(ally => <AllyCard key={ally.id} ally={ally} featured />)}
              </div>
            </div>
          )}
          {regular.length > 0 && (
            <div className="mb-14">
              {featured.length > 0 && <h2 className="text-xl font-bold mb-6 text-muted-foreground">{t("allies.allAlliesTitle")}</h2>}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                {regular.map(ally => <AllyCard key={ally.id} ally={ally} />)}
              </div>
            </div>
          )}
        </>
      )}

      {/* Cómo ser aliado */}
      <div className="mb-14">
        <h2 className="text-3xl font-display font-bold mb-3 text-center">{t("allies.howTitle")}</h2>
        <p className="text-muted-foreground text-center mb-10 max-w-2xl mx-auto">{t("allies.howSubtitle")}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {HOW_TO_ALLY.map((item, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className="bg-card border border-border rounded-3xl p-6 flex gap-5 items-start"
            >
              <div className="p-3 bg-primary/10 rounded-2xl shrink-0">
                <item.icon className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h3 className="font-bold mb-1">{t(item.titleKey)}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">{t(item.descKey)}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Benefits */}
      <div className="bg-gradient-to-br from-primary/5 to-primary/10 border border-primary/20 rounded-3xl p-8 mb-12">
        <h2 className="text-2xl font-display font-bold mb-2 text-center">{t("allies.benefitsTitle")}</h2>
        <p className="text-muted-foreground text-center mb-8 text-sm">{t("allies.benefitsSubtitle")}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {ALLY_BENEFITS.map((b, i) => (
            <div key={i} className="flex items-center gap-3 bg-card/60 rounded-xl px-4 py-3">
              <div className="w-2 h-2 rounded-full bg-primary shrink-0" />
              <p className="text-sm font-medium">{t(b)}</p>
            </div>
          ))}
        </div>
      </div>

      {/* CTA */}
      <div className="bg-card border border-border rounded-3xl p-8 text-center">
        <h3 className="font-display font-bold text-2xl mb-2">{t("allies.ctaTitle")}</h3>
        <p className="text-muted-foreground mb-6 max-w-md mx-auto">{t("allies.ctaDesc")}</p>
        <div className="flex gap-4 justify-center flex-wrap">
          <Link href="/contacto">
            <Button className="rounded-2xl h-12 px-8 shadow-md hover-elevate">
              {t("allies.writeNow")} <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </Link>
          <Link href="/como-ayudar">
            <Button variant="outline" className="rounded-2xl h-12 px-8">
              {t("allies.otherWays")}
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

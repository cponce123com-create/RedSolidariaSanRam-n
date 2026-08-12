import { motion, useScroll, useTransform, useInView, animate, MotionConfig } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import SEO from "@/components/shared/SEO";
import { useQuery } from "@tanstack/react-query";
import { useGetStats, useGetCampaigns } from "@workspace/api-client-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { CampaignCard } from "@/components/shared/CampaignCard";
import { optimizeImageUrl } from "@/lib/image-url";
import { Heart, Users, Gift, ShieldCheck, PawPrint, AlertTriangle, MapPin, ArrowRight, Baby, PersonStanding, Cat, Home as HomeIcon, Zap, Sparkles, Star, ChevronDown, HandHeart } from "lucide-react";

// Contador animado para la franja de estadísticas
function CountUp({ value }: { value: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const [display, setDisplay] = useState("0");
  useEffect(() => {
    if (!inView) return;
    const controls = animate(0, value, {
      duration: 1.8,
      ease: "easeOut",
      onUpdate: (v) => setDisplay(Math.round(v).toLocaleString("es-PE")),
    });
    return () => controls.stop();
  }, [inView, value]);
  return <span ref={ref}>{display}</span>;
}

// Tarjeta flotante decorativa del hero (solo escritorio)
function HeroCard({ img, icon, title, subtitle, accent }: {
  img?: string; icon?: React.ReactNode; title: string; subtitle: string; accent?: string;
}) {
  return (
    <div className="flex items-center gap-3 bg-card/85 backdrop-blur-md rounded-2xl py-3 pl-3 pr-5 shadow-lg shadow-primary/10 border border-white/60">
      {img ? (
        <img src={optimizeImageUrl(img, { width: 96 })} alt="" loading="lazy" className="w-12 h-12 rounded-xl object-cover shrink-0" />
      ) : (
        <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">{icon}</div>
      )}
      <div className="min-w-0">
        <p className="text-sm font-bold text-foreground leading-tight">{title}</p>
        <p className={`text-xs font-medium ${accent ?? "text-muted-foreground"}`}>{subtitle}</p>
      </div>
    </div>
  );
}

// Partículas decorativas que flotan sobre el fondo del hero
const FLOATING_PARTICLES = [
  { Icon: Heart, className: "top-[16%] left-[7%]", size: "w-6 h-6", color: "text-rose-300/80", delay: 0, duration: 7 },
  { Icon: Sparkles, className: "top-[30%] right-[9%] hidden md:block", size: "w-7 h-7", color: "text-yellow-300/80", delay: 1.2, duration: 8 },
  { Icon: PawPrint, className: "bottom-[26%] left-[12%] hidden sm:block", size: "w-6 h-6", color: "text-emerald-400/70", delay: 0.6, duration: 9 },
  { Icon: Star, className: "top-[14%] right-[30%] hidden lg:block", size: "w-5 h-5", color: "text-amber-300/80", delay: 2, duration: 6.5 },
  { Icon: Gift, className: "bottom-[30%] right-[16%] hidden sm:block", size: "w-6 h-6", color: "text-teal-400/70", delay: 1.6, duration: 8.5 },
  { Icon: Heart, className: "top-[58%] left-[22%] hidden xl:block", size: "w-4 h-4", color: "text-primary/50", delay: 2.4, duration: 7.5 },
  { Icon: Sparkles, className: "bottom-[16%] left-[30%] hidden lg:block", size: "w-5 h-5", color: "text-emerald-300/70", delay: 0.9, duration: 9.5 },
  { Icon: HandHeart, className: "top-[46%] right-[5%] hidden xl:block", size: "w-6 h-6", color: "text-rose-400/60", delay: 1.8, duration: 8 },
];

// Avatares demo para la fila de confianza (Unsplash)
const HERO_AVATARS = [
  "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=80&q=80",
  "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=80&q=80",
  "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&w=80&q=80",
];

interface FeaturedReport {
  id: number; type: string; title: string; description: string;
  location: string; urgency: string; photos: string[] | null; campaignId: number | null;
}

const TYPE_ICONS: Record<string, React.ElementType> = {
  "familia-vulnerable": Heart, "nino-necesidad": Baby, "adulto-mayor": PersonStanding,
  "animal-herido": Cat, "albergue": HomeIcon, "emergencia-comunitaria": Zap,
};
const URGENCY_COLOR: Record<string, string> = {
  low: "bg-green-500", medium: "bg-yellow-500", high: "bg-orange-500", critical: "bg-red-500 animate-pulse",
};

export default function Home() {
  const { t } = useTranslation();
  const { data: stats } = useGetStats();
  const { data: campaigns } = useGetCampaigns({ featured: true, status: "active" });
  const { data: featuredReports = [] } = useQuery<FeaturedReport[]>({
    queryKey: ["/api/reports/featured"],
    queryFn: async () => {
      const res = await fetch("/api/reports/featured");
      if (!res.ok) return [];
      return res.json();
    },
  });
  // Parallax del hero al hacer scroll
  const { scrollY } = useScroll();
  const bgY = useTransform(scrollY, [0, 700], [0, 140]);
  const contentOpacity = useTransform(scrollY, [0, 500], [1, 0.35]);
  const contentY = useTransform(scrollY, [0, 500], [0, -50]);

  return (
    <div className="min-h-screen pt-20">
      <SEO />
      {/* HERO SECTION */}
      <MotionConfig reducedMotion="user">
      <section className="relative overflow-hidden bg-background">
        {/* Fondo: gradiente + blobs animados (sin filter: transform-only, baratos en GPU) + patrón de puntos */}
        <motion.div className="absolute inset-0 z-0" style={{ y: bgY }}>
          <div className="absolute inset-0 bg-gradient-to-br from-green-50 via-emerald-50/60 to-teal-50/40"></div>
          <motion.div
            className="absolute -top-32 -right-32 w-[38rem] h-[38rem] transform-gpu"
            style={{ background: "radial-gradient(circle at 50% 50%, rgba(253, 230, 138, 0.45), transparent 65%)" }}
            animate={{ x: [0, -50, 0], y: [0, 40, 0], scale: [1, 1.12, 1] }}
            transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.div
            className="absolute -bottom-40 -left-32 w-[34rem] h-[34rem] transform-gpu"
            style={{ background: "radial-gradient(circle at 50% 50%, rgba(45, 212, 191, 0.4), transparent 65%)" }}
            animate={{ x: [0, 50, 0], y: [0, -35, 0], scale: [1.05, 1, 1.05] }}
            transition={{ duration: 14, repeat: Infinity, ease: "easeInOut", delay: 1.5 }}
          />
          <motion.div
            className="absolute top-[32%] left-[22%] w-[28rem] h-[28rem] transform-gpu"
            style={{ background: "radial-gradient(circle at 50% 50%, rgba(52, 211, 153, 0.35), transparent 65%)" }}
            animate={{ x: [0, 30, -20, 0], y: [0, -30, 20, 0], scale: [1, 1.12, 1] }}
            transition={{ duration: 16, repeat: Infinity, ease: "easeInOut", delay: 0.8 }}
          />
          <div
            className="absolute inset-0 opacity-60"
            style={{
              backgroundImage: "radial-gradient(circle at 1px 1px, rgb(16 185 129 / 0.14) 1px, transparent 0)",
              backgroundSize: "28px 28px",
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background/50 to-background"></div>
        </motion.div>

        {/* Partículas flotantes */}
        {FLOATING_PARTICLES.map(({ Icon, className, size, color, delay, duration }, i) => (
          <motion.span
            key={i}
            aria-hidden="true"
            className={`absolute z-[1] pointer-events-none transform-gpu ${className}`}
            animate={{ y: [0, -18, 0], rotate: [0, 8, -4, 0] }}
            transition={{ duration, delay, repeat: Infinity, ease: "easeInOut" }}
          >
            <Icon className={`${size} ${color}`} />
          </motion.span>
        ))}

        {/* Tarjetas flotantes decorativas (solo escritorio) */}
        <motion.div
          className="absolute right-[6%] top-[22%] z-10 hidden xl:flex flex-col gap-4 pointer-events-none transform-gpu"
          animate={{ y: [0, -14, 0] }}
          transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
        >
          <HeroCard
            img="https://images.unsplash.com/photo-1543589077-47d81606c1bf?auto=format&fit=crop&w=160&q=80"
            title={t("home.heroCardChristmasTitle")}
            subtitle={t("home.heroCardChristmasSubtitle")}
            accent="text-green-700"
          />
          <HeroCard
            icon={<Heart className="w-6 h-6" />}
            title={t("home.heroCardRaisedTitle")}
            subtitle={t("home.heroCardRaisedSubtitle")}
          />
        </motion.div>
        <motion.div
          className="absolute left-[5%] bottom-[24%] z-10 hidden xl:flex flex-col gap-4 pointer-events-none transform-gpu"
          animate={{ y: [0, 12, 0] }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut", delay: 1 }}
        >
          <HeroCard
            img="https://images.unsplash.com/photo-1552053831-71594a27632d?auto=format&fit=crop&w=160&q=80"
            title={t("home.heroCardPetTitle")}
            subtitle={t("home.heroCardPetSubtitle")}
            accent="text-amber-700"
          />
          <HeroCard
            icon={<Gift className="w-6 h-6" />}
            title={t("home.heroCardSchoolTitle")}
            subtitle={t("home.heroCardSchoolSubtitle")}
          />
        </motion.div>

        {/* Contenido */}
        <motion.div
          style={{ opacity: contentOpacity, y: contentY }}
          className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 pt-24 pb-40 lg:pt-36 lg:pb-56 flex flex-col items-center text-center"
        >
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full bg-primary/10 text-primary font-medium text-sm mb-8"
          >
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-primary" />
            </span>
            <Heart className="w-4 h-4" /> San Ramón, Chanchamayo
          </motion.div>

          <h1 className="text-5xl md:text-6xl lg:text-7xl font-display font-extrabold text-foreground tracking-tight max-w-4xl leading-[1.1] mb-6">
            <span className="block">
              {[t("home.heroTitleWord1"), t("home.heroTitleWord2")].map((word, i) => (
                <motion.span
                  key={i}
                  className="inline-block mr-[0.25em]"
                  initial={{ opacity: 0, y: 42 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.7, delay: 0.25 + i * 0.12, ease: "easeOut" }}
                >
                  {word}
                </motion.span>
              ))}
            </span>
            <span className="block">
              {[t("home.heroTitleWord3"), t("home.heroTitleWord4")].map((word, i) => (
                <motion.span
                  key={i}
                  className="inline-block mr-[0.25em] text-primary"
                  initial={{ opacity: 0, y: 42 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.7, delay: 0.49 + i * 0.12, ease: "easeOut" }}
                >
                  {word}
                </motion.span>
              ))}
            </span>
          </h1>

          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.9 }}
            className="text-xl md:text-2xl font-display font-semibold text-foreground/90 tracking-tight mb-3"
          >
            {t("home.heroTagline")}
          </motion.h2>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 1.05 }}
            className="text-xl md:text-2xl text-muted-foreground max-w-2xl mb-10 leading-relaxed"
          >
            {t("home.heroSubtitle")}
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.9 }}
            className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto"
          >
            <Link href="/campanas">
              <Button size="lg" className="w-full sm:w-auto rounded-xl text-lg h-14 px-8 shadow-xl shadow-primary/25 hover:-translate-y-1 transition-transform group">
                <Heart className="w-5 h-5 mr-2 group-hover:scale-110 transition-transform" />
                {t("nav.donateNow")}
              </Button>
            </Link>
            <Link href="/nosotros">
              <Button size="lg" variant="outline" className="w-full sm:w-auto rounded-xl text-lg h-14 px-8 bg-card/60 backdrop-blur-sm border-border hover:bg-card/90">
                {t("home.heroOurStory")}
              </Button>
            </Link>
          </motion.div>

          {/* Fila de confianza */}
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 1.05 }}
            className="mt-10 flex items-center gap-3"
          >
            <div className="flex -space-x-2.5">
              {HERO_AVATARS.map((url) => (
                <img key={url} src={url} alt="" className="w-10 h-10 rounded-full border-2 border-white object-cover shadow-sm" />
              ))}
            </div>
            <p className="text-sm text-muted-foreground text-left leading-tight">
              <span className="font-semibold text-foreground">{t("home.heroTrustCount")}</span> {t("home.heroTrustPrefix")}
              <br /> {t("home.heroTrustSuffix")}
            </p>
          </motion.div>
        </motion.div>

        {/* Indicador de scroll */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.6, duration: 1 }}
          className="absolute bottom-5 left-1/2 -translate-x-1/2 z-10 hidden md:flex flex-col items-center gap-1 text-muted-foreground"
          aria-hidden="true"
        >
          <span className="text-[11px] uppercase tracking-[0.2em] font-medium">{t("home.heroScroll")}</span>
          <motion.div animate={{ y: [0, 6, 0] }} transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}>
            <ChevronDown className="w-5 h-5" />
          </motion.div>
        </motion.div>
      </section>
      </MotionConfig>

      {/* STATS SECTION */}
      <section className="py-20 bg-primary text-primary-foreground relative -mt-10 rounded-t-[3rem] z-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-12 text-center divide-x-0 md:divide-x divide-primary-foreground/20">
            {[
              { value: stats?.childrenHelped ?? "—", label: t("home.statChildren") },
              { value: stats?.campaignsRun ?? "—", label: t("home.statCampaigns") },
              { value: stats?.volunteers ?? "—", label: t("home.statVolunteers") },
              { value: stats?.animalsHelped ?? "—", label: t("home.statAnimals") },
            ].map((stat, i) => (
              <motion.div 
                key={i}
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="flex flex-col items-center"
              >
                <div className="text-4xl md:text-5xl font-display font-bold mb-2">
                  {typeof stat.value === "number" ? <CountUp value={stat.value} /> : stat.value}
                </div>
                <div className="text-sm md:text-base text-primary-foreground/80 font-medium uppercase tracking-wider">{stat.label}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* FEATURED CAMPAIGNS */}
      <section className="py-24 bg-secondary/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row justify-between items-end mb-12 gap-6">
            <div className="max-w-2xl">
              <h2 className="text-3xl md:text-4xl font-display font-bold mb-4">{t("home.featuredTitle")}</h2>
              <p className="text-lg text-muted-foreground">{t("home.featuredSubtitle")}</p>
            </div>
            <Link href="/campanas">
              <Button variant="outline" className="rounded-xl bg-card">{t("home.featuredViewAll")}</Button>
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {campaigns?.slice(0, 3).map((campaign) => (
              <CampaignCard key={campaign.id} campaign={campaign} />
            ))}
            {!campaigns?.length && (
              <div className="col-span-full text-center py-12 text-muted-foreground">
                {t("home.featuredLoading")}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* URGENT CASES - only shown when there are featured reports */}
      {featuredReports.length > 0 && (
        <section className="py-24 bg-background">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col md:flex-row justify-between items-end mb-12 gap-6">
              <div className="max-w-2xl">
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-3 h-3 rounded-full bg-orange-500 animate-pulse" />
                  <span className="text-orange-700 font-bold text-sm uppercase tracking-wider">{t("home.urgentTag")}</span>
                </div>
                <h2 className="text-3xl md:text-4xl font-display font-bold mb-4">{t("nav.urgentCases")}</h2>
                <p className="text-lg text-muted-foreground">{t("home.urgentSubtitle")}</p>
              </div>
              <Link href="/casos-urgentes">
                <Button variant="outline" className="rounded-xl bg-card border-orange-300 text-orange-700 hover:bg-orange-50">
                  {t("home.urgentViewAll")} <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </Link>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {featuredReports.slice(0, 3).map((report) => {
                const TypeIcon = TYPE_ICONS[report.type] || AlertTriangle;
                const photo = report.photos?.[0];
                return (
                  <motion.div
                    key={report.id}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    className="bg-card border border-border rounded-3xl overflow-hidden shadow-sm hover:shadow-md transition-shadow flex flex-col"
                  >
                    <div className="aspect-[4/3] bg-secondary relative overflow-hidden">
                      {photo ? (
                        <img src={optimizeImageUrl(photo, { width: 800 })} alt={report.title} loading="lazy" decoding="async" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <TypeIcon className="w-16 h-16 text-muted-foreground opacity-20" />
                        </div>
                      )}
                      <div className={`absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-card shadow-sm`}>
                        <span className={`w-2 h-2 rounded-full ${URGENCY_COLOR[report.urgency] || "bg-secondary"}`} />
                        {report.urgency === "critical" ? t("home.urgencyCritical") : report.urgency === "high" ? t("home.urgencyHigh") : t("home.urgencyNormal")}
                      </div>
                    </div>
                    <div className="p-5 flex-1 flex flex-col gap-3">
                      <h3 className="font-display font-bold text-lg leading-tight line-clamp-2">{report.title}</h3>
                      <p className="text-muted-foreground text-sm line-clamp-2">{report.description}</p>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-auto">
                        <MapPin className="w-3.5 h-3.5" /> {report.location}
                      </div>
                      <div className="pt-2">
                        {report.campaignId ? (
                          <Link href={`/campanas/${report.campaignId}`}>
                            <Button size="sm" className="w-full rounded-xl h-9">
                              <Heart className="w-3.5 h-3.5 mr-1.5" /> {t("campaignCard.support")}
                            </Button>
                          </Link>
                        ) : (
                          <Link href="/casos-urgentes">
                            <Button variant="outline" size="sm" className="w-full rounded-xl h-9 border-primary/30 text-primary hover:bg-primary/5">
                              <ArrowRight className="w-3.5 h-3.5 mr-1.5" /> {t("home.urgentViewCase")}
                            </Button>
                          </Link>
                        )}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>

            <div className="mt-10 text-center">
              <Link href="/reportar">
                <Button variant="ghost" className="text-muted-foreground hover:text-foreground rounded-xl">
                  {t("home.urgentKnowSomeone")} <span className="text-primary font-semibold ml-1">{t("home.urgentReportHere")}</span>
                </Button>
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* HOW TO HELP */}
      <section className="py-24 bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-3xl md:text-4xl font-display font-bold mb-4">{t("home.helpTitle")}</h2>
            <p className="text-lg text-muted-foreground">{t("home.helpSubtitle")}</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { icon: Heart, title: t("home.helpMonetaryTitle"), desc: t("home.helpMonetaryDesc"), color: "bg-primary/10 text-primary" },
              { icon: Gift, title: t("home.helpProductsTitle"), desc: t("home.helpProductsDesc"), color: "bg-blue-500/10 text-blue-500" },
              { icon: Users, title: t("home.helpVolunteerTitle"), desc: t("home.helpVolunteerDesc"), color: "bg-orange-500/10 text-orange-500" },
              { icon: PawPrint, title: t("home.helpAnimalTitle"), desc: t("home.helpAnimalDesc"), color: "bg-accent/10 text-accent" },
            ].map((item, i) => (
              <motion.div 
                key={i}
                whileHover={{ y: -5 }}
                className="bg-card p-8 rounded-2xl border border-border/50 shadow-sm hover:shadow-lg transition-all text-center flex flex-col items-center"
              >
                <div className={`w-16 h-16 rounded-full ${item.color} flex items-center justify-center mb-6`}>
                  <item.icon className="w-8 h-8" />
                </div>
                <h3 className="font-display font-bold text-xl mb-3">{item.title}</h3>
                <p className="text-muted-foreground text-sm">{item.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* TRANSPARENCY CTA */}
      <section className="py-20 relative overflow-hidden">
        {/* bg smiling kids abstract unplash image */}
        <img 
          src={optimizeImageUrl("https://images.unsplash.com/photo-1593113598332-cd288d649433?w=1600&q=80", { width: 800 })} 
          alt={t("home.transparencyImageAlt")} 
          loading="lazy"
          decoding="async"
          className="absolute inset-0 w-full h-full object-cover opacity-20"
        />
        <div className="absolute inset-0 bg-primary/90 mix-blend-multiply" />
        
        <div className="max-w-4xl mx-auto px-4 relative z-10 text-center text-white">
          <ShieldCheck className="w-16 h-16 mx-auto mb-6 opacity-90" />
          <h2 className="text-3xl md:text-5xl font-display font-bold mb-6">{t("home.transparencyTitle")}</h2>
          <p className="text-lg md:text-xl text-white/90 mb-10 leading-relaxed">
            {t("home.transparencyDesc")}
          </p>
          <Link href="/nosotros">
            <Button size="lg" className="bg-card text-primary hover:bg-card/90 rounded-xl text-lg h-14 px-8">
              {t("home.transparencyCta")}
            </Button>
          </Link>
        </div>
      </section>
    </div>
  );
}

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle, Heart, Baby, PersonStanding, Cat, Home, Zap,
  MapPin, Clock, Filter, Plus, ArrowRight, Search
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { optimizeImageUrl } from "@/lib/image-url";

interface CommunityReport {
  id: number;
  type: string;
  title: string;
  description: string;
  location: string;
  urgency: string;
  photos: string[] | null;
  reporterName: string;
  isAnonymous: boolean;
  status: string;
  campaignId: number | null;
  featuredOnHome: boolean;
  createdAt: string;
}

export default function UrgentCases() {
  const { t } = useTranslation();
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");

  const TYPE_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string }> = {
    "familia-vulnerable": { label: t("urgentCases.typeVulnerableFamily"), icon: Heart, color: "bg-pink-100 text-pink-700" },
    "nino-necesidad": { label: t("urgentCases.typeChildInNeed"), icon: Baby, color: "bg-blue-100 text-blue-700" },
    "adulto-mayor": { label: t("urgentCases.typeSenior"), icon: PersonStanding, color: "bg-purple-100 text-purple-700" },
    "animal-herido": { label: t("urgentCases.typeInjuredAnimal"), icon: Cat, color: "bg-orange-100 text-orange-700" },
    "albergue": { label: t("urgentCases.typeShelter"), icon: Home, color: "bg-green-100 text-green-700" },
    "emergencia-comunitaria": { label: t("urgentCases.typeEmergency"), icon: Zap, color: "bg-red-100 text-red-700" },
  };

  const URGENCY_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
    low: { label: t("urgentCases.urgencyLow"), color: "bg-green-100 text-green-700 border-green-200", dot: "bg-green-500" },
    medium: { label: t("urgentCases.urgencyMedium"), color: "bg-yellow-100 text-yellow-700 border-yellow-200", dot: "bg-yellow-500" },
    high: { label: t("urgentCases.urgencyHigh"), color: "bg-orange-100 text-orange-700 border-orange-200", dot: "bg-orange-500" },
    critical: { label: t("urgentCases.urgencyCritical"), color: "bg-red-100 text-red-700 border-red-200", dot: "bg-red-500 animate-pulse" },
  };

  const ALL_TYPES = [
    { value: "all", label: t("urgentCases.typeAll") },
    { value: "familia-vulnerable", label: t("urgentCases.typeFamilies") },
    { value: "nino-necesidad", label: t("urgentCases.typeChildren") },
    { value: "adulto-mayor", label: t("urgentCases.typeSeniors") },
    { value: "animal-herido", label: t("urgentCases.typeAnimals") },
    { value: "albergue", label: t("urgentCases.typeShelters") },
    { value: "emergencia-comunitaria", label: t("urgentCases.typeEmergencies") },
  ];

  function timeAgo(dateStr: string) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const days = Math.floor(diff / 86400000);
    if (days === 0) return t("urgentCases.today");
    if (days === 1) return t("urgentCases.yesterday");
    if (days < 7) return t("urgentCases.daysAgo", { count: days });
    if (days < 30) return t("urgentCases.weeksAgo", { count: Math.floor(days / 7) });
    return t("urgentCases.monthsAgo", { count: Math.floor(days / 30) });
  }

  const { data: reports = [], isLoading } = useQuery<CommunityReport[]>({
    queryKey: ["/api/reports/urgent"],
    queryFn: async () => {
      const res = await fetch("/api/reports/urgent");
      if (!res.ok) throw new Error("Error cargando casos");
      return res.json();
    },
  });

  const filtered = reports.filter(r => {
    const matchesType = filter === "all" || r.type === filter;
    const matchesSearch = !search || r.title.toLowerCase().includes(search.toLowerCase()) || r.description.toLowerCase().includes(search.toLowerCase()) || r.location.toLowerCase().includes(search.toLowerCase());
    return matchesType && matchesSearch;
  });

  const criticalCount = reports.filter(r => r.urgency === "critical").length;

  return (
    <div className="max-w-6xl mx-auto px-4 pt-24 sm:pt-28 pb-10 sm:pb-16">
      {/* Header */}
      <div className="mb-10">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-3 bg-red-100 rounded-2xl">
            <AlertTriangle className="w-7 h-7 text-red-600" />
          </div>
          <span className="bg-red-100 text-red-700 text-sm font-bold px-3 py-1 rounded-full uppercase tracking-wider">Red Solidaria</span>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-end gap-4 justify-between">
          <div>
            <h1 className="text-4xl sm:text-5xl font-display font-black text-foreground mb-3">{t("nav.urgentCases")}</h1>
            <p className="text-muted-foreground text-lg max-w-2xl">
              {t("urgentCases.intro")}
            </p>
          </div>
          <Link href="/reportar">
            <Button className="rounded-2xl h-12 px-6 shadow-lg shadow-primary/20 hover-elevate shrink-0">
              <Plus className="w-4 h-4 mr-2" /> {t("urgentCases.reportCase")}
            </Button>
          </Link>
        </div>

        {criticalCount > 0 && (
          <div className="mt-6 bg-red-50 border border-red-200 rounded-2xl p-4 flex items-center gap-3">
            <span className="w-3 h-3 rounded-full bg-red-500 animate-pulse shrink-0" />
            <p className="text-red-700 font-semibold">
              {t("urgentCases.criticalBanner", { count: criticalCount })}
            </p>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4 mb-8">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder={t("urgentCases.searchPlaceholder")}
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-10 rounded-xl bg-secondary/30"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {ALL_TYPES.map(ft => (
            <button
              key={ft.value}
              onClick={() => setFilter(ft.value)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors whitespace-nowrap ${
                filter === ft.value ? "bg-primary text-white shadow-md" : "bg-secondary text-muted-foreground hover:bg-secondary/80"
              }`}
            >
              {ft.label}
            </button>
          ))}
        </div>
      </div>

      {/* Cases grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-card rounded-3xl border border-border overflow-hidden animate-pulse">
              <div className="aspect-[4/3] bg-secondary" />
              <div className="p-5 space-y-3">
                <div className="h-4 bg-secondary rounded w-3/4" />
                <div className="h-4 bg-secondary rounded w-full" />
                <div className="h-4 bg-secondary rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 space-y-4">
          <div className="w-16 h-16 bg-secondary rounded-full flex items-center justify-center mx-auto">
            <Heart className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="text-xl font-bold text-foreground">
            {reports.length === 0 ? t("urgentCases.emptyNoCasesTitle") : t("urgentCases.emptyNoResultsTitle")}
          </h3>
          <p className="text-muted-foreground">
            {reports.length === 0
              ? t("urgentCases.emptyNoCasesDesc")
              : t("urgentCases.emptyNoResultsDesc")}
          </p>
          <Link href="/reportar">
            <Button className="rounded-xl mt-2">{t("urgentCases.reportCase")}</Button>
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map(report => {
            const typeConfig = TYPE_CONFIG[report.type] || { label: report.type, icon: AlertTriangle, color: "bg-secondary text-foreground" };
            const urgencyConfig = URGENCY_CONFIG[report.urgency] || URGENCY_CONFIG.medium;
            const TypeIcon = typeConfig.icon;
            const photo = report.photos?.[0];

            return (
              <div key={report.id} className="bg-card border border-border rounded-3xl overflow-hidden shadow-sm hover:shadow-md transition-shadow group flex flex-col">
                {/* Photo or placeholder */}
                <div className="aspect-[4/3] bg-secondary flex items-center justify-center overflow-hidden relative">
                  {photo ? (
                    <img src={optimizeImageUrl(photo, { width: 640 })} alt={report.title} loading="lazy" decoding="async" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                  ) : (
                    <div className={`w-full h-full flex flex-col items-center justify-center gap-3 ${typeConfig.color}`}>
                      <TypeIcon className="w-16 h-16 opacity-30" />
                      <span className="text-sm font-semibold opacity-60">{typeConfig.label}</span>
                    </div>
                  )}
                  {/* Urgency badge */}
                  <div className={`absolute top-3 left-3 flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${urgencyConfig.color}`}>
                    <span className={`w-2 h-2 rounded-full ${urgencyConfig.dot}`} />
                    {urgencyConfig.label}
                  </div>
                  {/* Type badge */}
                  <div className={`absolute top-3 right-3 flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${typeConfig.color}`}>
                    <TypeIcon className="w-3 h-3" />
                    {typeConfig.label}
                  </div>
                  {/* Campaign badge */}
                  {report.campaignId && (
                    <div className="absolute bottom-3 left-3 bg-green-600 text-white text-xs font-bold px-2.5 py-1 rounded-full">
                      {t("urgentCases.activeCampaignBadge")}
                    </div>
                  )}
                </div>

                <div className="p-5 flex-1 flex flex-col gap-3">
                  <h3 className="font-display font-bold text-lg leading-tight line-clamp-2">{report.title}</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed line-clamp-3">{report.description}</p>

                  <div className="flex items-center gap-2 text-xs text-muted-foreground mt-auto pt-3 border-t border-border">
                    <MapPin className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{report.location}</span>
                    <span className="mx-auto" />
                    <Clock className="w-3.5 h-3.5 shrink-0" />
                    <span className="whitespace-nowrap">{timeAgo(report.createdAt)}</span>
                  </div>

                  <div className="flex gap-2 pt-2">
                    {report.campaignId ? (
                      <Link href={`/campanas/${report.campaignId}`} className="flex-1">
                        <Button className="w-full rounded-xl h-10" size="sm">
                          <Heart className="w-4 h-4 mr-1" /> {t("urgentCases.viewCampaign")} <ArrowRight className="w-3.5 h-3.5 ml-1" />
                        </Button>
                      </Link>
                    ) : (
                      <Link href="/reportar" className="flex-1">
                        <Button variant="outline" className="w-full rounded-xl h-10 border-primary/30 text-primary hover:bg-primary/5" size="sm">
                          <Heart className="w-4 h-4 mr-1" /> {t("urgentCases.wantToHelp")}
                        </Button>
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* CTA bottom */}
      {filtered.length > 0 && (
        <div className="mt-16 bg-primary/5 border border-primary/20 rounded-3xl p-8 text-center">
          <h3 className="font-display font-bold text-2xl mb-2">{t("urgentCases.ctaTitle")}</h3>
          <p className="text-muted-foreground mb-5">{t("urgentCases.ctaDesc")}</p>
          <Link href="/reportar">
            <Button className="rounded-2xl px-8 h-12 shadow-md shadow-primary/20 hover-elevate">
              <Plus className="w-4 h-4 mr-2" /> {t("urgentCases.reportCaseNow")}
            </Button>
          </Link>
        </div>
      )}
    </div>
  );
}

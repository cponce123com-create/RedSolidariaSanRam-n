import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Shield, Target, TrendingUp, Users, Receipt, ArrowRight, Heart, ChevronLeft, ChevronRight } from "lucide-react";
import SEO from "@/components/shared/SEO";
import { CmsPageHeading } from "@/components/shared/CmsPageHeading";
import ShareButtons from "@/components/shared/ShareButtons";

interface CampaignSummary {
  id: number;
  title: string;
  goal: number;
  raised: number;
  donorCount: number;
  status: string;
  category?: string | null;
}

interface TransparencyLedgerEntry {
  id: number;
  type: "income" | "expense";
  campaignId: number | null;
  campaignTitle: string;
  date: string | null;
  amount: number;
  description: string;
}

interface TransparencyLedgerResponse {
  total: number;
  limit: number;
  offset: number;
  entries: TransparencyLedgerEntry[];
}

interface DonationStats {
  totalDonations: number;
  totalAmount: number;
  pendingCount: number;
  approvedCount: number;
  totalDonors: number;
}

const formatCurrency = (val: number | string | null | undefined) =>
  `S/ ${Number(val ?? 0).toLocaleString("es-PE", { minimumFractionDigits: 2 })}`;

export default function Transparency() {
  const { t } = useTranslation();
  const [ledgerPage, setLedgerPage] = useState(0);
  const ledgerLimit = 50;
  const campaignsQuery = useQuery<CampaignSummary[]>({
    queryKey: ["transparency-campaigns"],
    queryFn: async () => {
      const res = await fetch("/api/campaigns?limit=100");
      if (!res.ok) throw new Error("No se pudieron cargar las campañas");
      return res.json();
    },
  });

  const statsQuery = useQuery<DonationStats>({
    queryKey: ["transparency-stats"],
    queryFn: async () => {
      const res = await fetch("/api/donations/stats");
      if (!res.ok) throw new Error("No se pudieron cargar las estadísticas");
      return res.json();
    },
  });

  const ledgerQuery = useQuery<TransparencyLedgerResponse>({
    queryKey: ["transparency-ledger", ledgerPage],
    queryFn: async () => {
      const offset = ledgerPage * ledgerLimit;
      const res = await fetch(`/api/transparency/ledger?limit=${ledgerLimit}&offset=${offset}`);
      if (!res.ok) throw new Error("No se pudo cargar el registro público");
      return res.json();
    },
  });

  const campaigns = (campaignsQuery.data ?? [])
    .filter((c) => c.status === "active" || c.status === "completed")
    .sort((a, b) => b.raised - a.raised);

  const isLoading = campaignsQuery.isLoading || statsQuery.isLoading;

  return (
    <div className="min-h-screen pt-24 pb-24 bg-[#FAF9F6]">
      <SEO title={t("nav.transparency")} description={t("seo.defaultDescription")} />
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        {/* Hero */}
        <div className="text-center mb-12">
          <div className="w-16 h-16 bg-primary/10 text-primary rounded-full flex items-center justify-center mx-auto mb-4">
            <Shield className="w-8 h-8" />
          </div>
          <CmsPageHeading
            slug="transparencia"
            title={t("transparency.title")}
            subtitle={t("transparency.heroDescription")}
            titleClassName="text-4xl font-display font-black mb-3"
            subtitleClassName="text-muted-foreground max-w-2xl mx-auto"
          />
        </div>

        <div className="mb-10 flex justify-center">
          <ShareButtons
            title="Transparencia — Red Solidaria San Ramón"
            description="Consulta los aportes confirmados y los gastos publicados."
          />
        </div>

        {/* Resumen general */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-12">
          <div className="bg-card rounded-2xl border border-gray-100 shadow-sm p-6 text-center">
            <TrendingUp className="w-6 h-6 text-primary mx-auto mb-2" />
            <p className="text-2xl font-black">
              {statsQuery.data ? formatCurrency(statsQuery.data.totalAmount) : "—"}
            </p>
            <p className="text-sm text-muted-foreground mt-1">{t("transparency.statRaised")}</p>
          </div>
          <div className="bg-card rounded-2xl border border-gray-100 shadow-sm p-6 text-center">
            <Receipt className="w-6 h-6 text-primary mx-auto mb-2" />
            <p className="text-2xl font-black">
              {statsQuery.data ? statsQuery.data.totalDonations.toLocaleString("es-PE") : "—"}
            </p>
            <p className="text-sm text-muted-foreground mt-1">{t("transparency.statDonations")}</p>
          </div>
          <div className="bg-card rounded-2xl border border-gray-100 shadow-sm p-6 text-center">
            <Users className="w-6 h-6 text-primary mx-auto mb-2" />
            <p className="text-2xl font-black">
              {statsQuery.data ? statsQuery.data.totalDonors.toLocaleString("es-PE") : "—"}
            </p>
            <p className="text-sm text-muted-foreground mt-1">{t("transparency.statDonors")}</p>
          </div>
        </div>

        {/* Desglose por campaña */}
        <div className="flex items-center gap-2 mb-6">
          <Target className="w-5 h-5 text-primary" />
          <h2 className="text-2xl font-bold">{t("transparency.breakdownTitle")}</h2>
        </div>

        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-card rounded-2xl border border-gray-100 shadow-sm h-28 animate-pulse" />
            ))}
          </div>
        ) : campaigns.length === 0 ? (
          <div className="bg-card rounded-2xl border border-gray-100 shadow-sm p-10 text-center text-muted-foreground">
            <Heart className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">{t("transparency.emptyTitle")}</p>
            <p className="text-sm mt-1">{t("transparency.emptyDescription")}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {campaigns.map((c) => {
              const pct = c.goal > 0 ? Math.min(100, Math.round((c.raised / c.goal) * 100)) : 0;
              return (
                <Link
                  key={c.id}
                  href={`/campanas/${c.id}/transparencia`}
                  className="block bg-card rounded-2xl border border-gray-100 shadow-sm p-6 hover:shadow-md hover:-translate-y-0.5 hover:border-primary/30 transition-all group"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                    <div>
                      <h3 className="font-bold text-lg group-hover:text-primary transition-colors">{c.title}</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {t(c.status === "active" ? "transparency.statusActive" : "transparency.statusCompleted")}
                        {c.category ? ` · ${c.category}` : ""} · {t("transparency.donorCount", { count: c.donorCount })}
                      </p>
                    </div>
                    <span className="inline-flex items-center gap-1 text-sm font-semibold text-primary shrink-0">
                      {t("transparency.viewDetail")}{" "}
                      <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                    </span>
                  </div>
                  <Progress value={pct} className="h-2.5 mb-2" />
                  <div className="flex justify-between text-sm">
                    <span className="font-semibold text-primary">{formatCurrency(c.raised)}</span>
                    <span className="text-muted-foreground">{t("transparency.goal", { goal: formatCurrency(c.goal), pct })}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        {/* Registro público completo y compartible */}
        <section className="mt-14" aria-labelledby="public-ledger-title">
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 id="public-ledger-title" className="text-2xl font-bold">Registro público de ingresos y gastos</h2>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                Se muestran los aportes confirmados y los gastos que el equipo publicó. Los datos personales de los donantes se mantienen privados.
              </p>
            </div>
            <span className="text-sm text-muted-foreground">
              {ledgerQuery.data ? `${ledgerQuery.data.total.toLocaleString("es-PE")} movimientos` : ""}
            </span>
          </div>

          {ledgerQuery.isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => <div key={i} className="h-20 animate-pulse rounded-2xl border bg-card" />)}
            </div>
          ) : ledgerQuery.isError ? (
            <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-6 text-sm text-destructive">
              No se pudo cargar el registro ahora. Intenta actualizar la página.
            </div>
          ) : !ledgerQuery.data?.entries.length ? (
            <div className="rounded-2xl border bg-card p-8 text-center text-muted-foreground">
              Aún no hay aportes confirmados ni gastos publicados.
            </div>
          ) : (
            <>
              <div className="space-y-3">
                {ledgerQuery.data.entries.map((entry) => (
                  <article key={`${entry.type}-${entry.id}`} className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-5">
                    <div className="min-w-0">
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${entry.type === "income" ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`}>
                          {entry.type === "income" ? "Ingreso confirmado" : "Gasto publicado"}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {entry.date ? new Date(entry.date).toLocaleDateString("es-PE") : "Fecha no disponible"}
                        </span>
                      </div>
                      <p className="truncate font-semibold">{entry.description}</p>
                      <p className="text-sm text-muted-foreground">{entry.campaignTitle}</p>
                    </div>
                    <p className={`shrink-0 text-lg font-bold ${entry.type === "income" ? "text-emerald-700" : "text-rose-700"}`}>
                      {entry.type === "income" ? "+" : "−"}{formatCurrency(entry.amount)}
                    </p>
                  </article>
                ))}
              </div>
              <div className="mt-5 flex items-center justify-between gap-3">
                <Button variant="outline" size="sm" className="rounded-xl" disabled={ledgerPage === 0} onClick={() => setLedgerPage((page) => Math.max(0, page - 1))}>
                  <ChevronLeft className="mr-1 h-4 w-4" /> Anterior
                </Button>
                <span className="text-xs text-muted-foreground">
                  Página {ledgerPage + 1} de {Math.max(1, Math.ceil((ledgerQuery.data.total || 0) / ledgerLimit))}
                </span>
                <Button variant="outline" size="sm" className="rounded-xl" disabled={(ledgerPage + 1) * ledgerLimit >= ledgerQuery.data.total} onClick={() => setLedgerPage((page) => page + 1)}>
                  Siguiente <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

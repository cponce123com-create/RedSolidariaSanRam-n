import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Progress } from "@/components/ui/progress";
import { Shield, Target, TrendingUp, Users, Receipt, ArrowRight, Heart } from "lucide-react";

interface CampaignSummary {
  id: number;
  title: string;
  goal: number;
  raised: number;
  donorCount: number;
  status: string;
  category?: string | null;
}

interface DonationStats {
  totalDonations: number;
  totalAmount: number;
  pendingCount: number;
  approvedCount: number;
  totalDonors: number;
}

const formatCurrency = (val: number) =>
  `S/ ${val.toLocaleString("es-PE", { minimumFractionDigits: 2 })}`;

export default function Transparency() {
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

  const campaigns = (campaignsQuery.data ?? [])
    .filter((c) => c.status === "active" || c.status === "completed")
    .sort((a, b) => b.raised - a.raised);

  const isLoading = campaignsQuery.isLoading || statsQuery.isLoading;

  return (
    <div className="min-h-screen pt-24 pb-24 bg-[#FAF9F6]">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        {/* Hero */}
        <div className="text-center mb-12">
          <div className="w-16 h-16 bg-primary/10 text-primary rounded-full flex items-center justify-center mx-auto mb-4">
            <Shield className="w-8 h-8" />
          </div>
          <h1 className="text-4xl font-display font-black mb-3">Transparencia</h1>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Cada sol recaudado está documentado. Publicamos el avance de cada campaña, los
            gastos ejecutados y las evidencias de entrega, para que donantes y comunidad
            puedan verificar el impacto de su apoyo.
          </p>
        </div>

        {/* Resumen general */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-12">
          <div className="bg-card rounded-2xl border border-gray-100 shadow-sm p-6 text-center">
            <TrendingUp className="w-6 h-6 text-primary mx-auto mb-2" />
            <p className="text-2xl font-black">
              {statsQuery.data ? formatCurrency(statsQuery.data.totalAmount) : "—"}
            </p>
            <p className="text-sm text-muted-foreground mt-1">Recaudado (donaciones aprobadas)</p>
          </div>
          <div className="bg-card rounded-2xl border border-gray-100 shadow-sm p-6 text-center">
            <Receipt className="w-6 h-6 text-primary mx-auto mb-2" />
            <p className="text-2xl font-black">
              {statsQuery.data ? statsQuery.data.totalDonations.toLocaleString("es-PE") : "—"}
            </p>
            <p className="text-sm text-muted-foreground mt-1">Donaciones registradas</p>
          </div>
          <div className="bg-card rounded-2xl border border-gray-100 shadow-sm p-6 text-center">
            <Users className="w-6 h-6 text-primary mx-auto mb-2" />
            <p className="text-2xl font-black">
              {statsQuery.data ? statsQuery.data.totalDonors.toLocaleString("es-PE") : "—"}
            </p>
            <p className="text-sm text-muted-foreground mt-1">Donantes</p>
          </div>
        </div>

        {/* Desglose por campaña */}
        <div className="flex items-center gap-2 mb-6">
          <Target className="w-5 h-5 text-primary" />
          <h2 className="text-2xl font-bold">Desglose por campaña</h2>
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
            <p className="font-medium">Todavía no hay campañas públicas con movimientos.</p>
            <p className="text-sm mt-1">Pronto publicaremos el detalle de cada iniciativa.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {campaigns.map((c) => {
              const pct = c.goal > 0 ? Math.min(100, Math.round((c.raised / c.goal) * 100)) : 0;
              return (
                <div key={c.id} className="bg-card rounded-2xl border border-gray-100 shadow-sm p-6">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                    <div>
                      <h3 className="font-bold text-lg">{c.title}</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {c.status === "active" ? "Campaña activa" : "Campaña completada"}
                        {c.category ? ` · ${c.category}` : ""} · {c.donorCount} donantes
                      </p>
                    </div>
                    <Link href={`/campanas/${c.id}/transparencia`} className="shrink-0">
                      <span className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
                        Ver detalle <ArrowRight className="w-4 h-4" aria-hidden="true" />
                      </span>
                    </Link>
                  </div>
                  <Progress value={pct} className="h-2.5 mb-2" />
                  <div className="flex justify-between text-sm">
                    <span className="font-semibold text-primary">{formatCurrency(c.raised)}</span>
                    <span className="text-muted-foreground">Meta: {formatCurrency(c.goal)} ({pct}%)</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

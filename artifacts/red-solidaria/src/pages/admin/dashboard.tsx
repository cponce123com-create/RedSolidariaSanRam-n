import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from "recharts";
import {
  Target, DollarSign, TrendingDown, Wallet, AlertTriangle,
  Dog, Users, MessageSquare, Newspaper, ArrowRight, Clock,
  CheckCircle, TrendingUp
} from "lucide-react";

interface DashboardData {
  summary: {
    totalCampaigns: number; activeCampaigns: number; completedCampaigns: number;
    totalRaised: number; totalSpent: number; balance: number;
    pendingReports: number; pendingAdoptions: number; pendingVolunteers: number;
    newVolunteersThisMonth: number; availablePets: number;
  };
  charts: {
    monthlyDonations: { month: string; total: number; count: number }[];
    topCampaigns: { title: string; raised: number; goal: number; status: string }[];
    expensesByCategory: { category: string; total: number; count: number }[];
  };
  recent: {
    donations: { id: number; name: string; amount: number; method: string; status: string; createdAt: string }[];
    volunteers: { id: number; name: string; availability: string; status: string; createdAt: string }[];
    messages: { id: number; name: string; subject: string; createdAt: string }[];
    news: { id: number; title: string; createdAt: string }[];
  };
}

const CHART_COLORS = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#3b82f6", "#8b5cf6"];

const MONTH_NAMES: Record<string, string> = {
  "01": "Ene", "02": "Feb", "03": "Mar", "04": "Abr", "05": "May",
  "06": "Jun", "07": "Jul", "08": "Ago", "09": "Set", "10": "Oct",
  "11": "Nov", "12": "Dic",
};

function formatMonth(m: string) {
  const [, month] = m.split("-");
  return MONTH_NAMES[month] || m;
}

function StatCard({ icon: Icon, label, value, sub, color, href }: {
  icon: any; label: string; value: string | number; sub?: string;
  color: string; href?: string;
}) {
  const inner = (
    <div className={`bg-card border border-border rounded-2xl p-5 flex items-center gap-4 shadow-sm hover:shadow-md transition-all ${href ? "cursor-pointer hover:border-primary/30" : ""}`}>
      <div className={`p-3 rounded-xl ${color}`}>
        <Icon className="w-5 h-5 text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{label}</p>
        <p className="text-2xl font-display font-bold leading-tight">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </div>
      {href && <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />}
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

const STATUS_BADGE: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  approved: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
  reviewing: "bg-blue-100 text-blue-800",
};

export default function AdminDashboard() {
  const { data, isLoading, error } = useQuery<DashboardData>({
    queryKey: ["/api/admin/dashboard"],
    queryFn: async () => {
      const res = await fetch("/api/admin/dashboard", { credentials: "include" });
      if (!res.ok) throw new Error("Error");
      return res.json();
    },
    refetchInterval: 60000,
  });

  if (isLoading) {
    return (
      <div className="p-8">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {[...Array(8)].map((_, i) => <div key={i} className="bg-card border border-border rounded-2xl h-24 animate-pulse" />)}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return <div className="p-8 text-muted-foreground">Error al cargar el dashboard.</div>;
  }

  const { summary, charts, recent } = data;
  const hasMonthlyData = charts.monthlyDonations.length > 0;
  const hasExpenses = charts.expensesByCategory.length > 0;

  return (
    <div className="p-6 sm:p-8 max-w-7xl space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-display font-black">Dashboard General</h1>
        <p className="text-muted-foreground mt-1">Vista operativa en tiempo real — actualizado cada minuto</p>
      </div>

      {/* Alert banners for pending items */}
      {(summary.pendingReports > 0 || summary.pendingAdoptions > 0 || summary.pendingVolunteers > 0) && (
        <div className="flex flex-wrap gap-3">
          {summary.pendingReports > 0 && (
            <Link href="/admin/reportes">
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-2 cursor-pointer hover:bg-red-100 transition-colors">
                <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                <span className="text-red-700 text-sm font-semibold">{summary.pendingReports} reporte{summary.pendingReports > 1 ? "s" : ""} pendiente{summary.pendingReports > 1 ? "s" : ""}</span>
              </div>
            </Link>
          )}
          {summary.pendingAdoptions > 0 && (
            <Link href="/admin/adopciones">
              <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2 cursor-pointer hover:bg-amber-100 transition-colors">
                <span className="w-2 h-2 bg-amber-500 rounded-full animate-pulse" />
                <span className="text-amber-700 text-sm font-semibold">{summary.pendingAdoptions} adopción{summary.pendingAdoptions > 1 ? "es" : ""} por revisar</span>
              </div>
            </Link>
          )}
          {summary.pendingVolunteers > 0 && (
            <Link href="/admin/voluntarios">
              <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-xl px-4 py-2 cursor-pointer hover:bg-blue-100 transition-colors">
                <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                <span className="text-blue-700 text-sm font-semibold">{summary.pendingVolunteers} voluntario{summary.pendingVolunteers > 1 ? "s" : ""} nuevos</span>
              </div>
            </Link>
          )}
        </div>
      )}

      {/* KPI Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Target} label="Campañas activas" value={summary.activeCampaigns} sub={`${summary.completedCampaigns} finalizadas`} color="bg-primary" href="/admin/campanas" />
        <StatCard icon={TrendingUp} label="Total recaudado" value={`S/ ${summary.totalRaised.toLocaleString("es-PE", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`} sub="Donaciones aprobadas" color="bg-green-500" href="/admin/donaciones" />
        <StatCard icon={TrendingDown} label="Total gastado" value={`S/ ${summary.totalSpent.toLocaleString("es-PE", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`} sub="Gastos registrados" color="bg-orange-500" />
        <StatCard icon={Wallet} label="Saldo disponible" value={`S/ ${(summary.balance).toLocaleString("es-PE", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`} sub={summary.balance >= 0 ? "Positivo" : "⚠️ Negativo"} color={summary.balance >= 0 ? "bg-emerald-600" : "bg-red-500"} />
        <StatCard icon={AlertTriangle} label="Reportes pendientes" value={summary.pendingReports} sub="Sin atender" color="bg-red-500" href="/admin/reportes" />
        <StatCard icon={Dog} label="Mascotas disponibles" value={summary.availablePets} sub="En adopción" color="bg-amber-500" href="/admin/adopciones" />
        <StatCard icon={Users} label="Nuevos voluntarios" value={summary.newVolunteersThisMonth} sub="Últimos 30 días" color="bg-violet-500" href="/admin/voluntarios" />
        <StatCard icon={MessageSquare} label="Mensajes recientes" value={recent.messages.length} sub="Últimos mensajes" color="bg-blue-500" href="/admin/mensajes" />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Monthly donations area chart */}
        <div className="lg:col-span-2 bg-card border border-border rounded-2xl p-6 shadow-sm">
          <h3 className="font-bold mb-1">Evolución de donaciones</h3>
          <p className="text-xs text-muted-foreground mb-5">Montos recibidos por mes (últimos 6 meses)</p>
          {hasMonthlyData ? (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={charts.monthlyDonations.map(d => ({ ...d, month: formatMonth(d.month) }))}>
                <defs>
                  <linearGradient id="donGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `S/${v}`} />
                <Tooltip formatter={(v: any) => [`S/ ${Number(v).toFixed(0)}`, "Recaudado"]} />
                <Area type="monotone" dataKey="total" stroke="#ef4444" fill="url(#donGrad)" strokeWidth={2} dot={{ r: 4 }} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[220px] flex items-center justify-center text-muted-foreground text-sm">
              Sin datos de donaciones aún — aparecerán aquí con el tiempo.
            </div>
          )}
        </div>

        {/* Expenses by category pie */}
        <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
          <h3 className="font-bold mb-1">Gastos por categoría</h3>
          <p className="text-xs text-muted-foreground mb-5">Distribución total de egresos</p>
          {hasExpenses ? (
            <>
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie data={charts.expensesByCategory} dataKey="total" nameKey="category" cx="50%" cy="50%" outerRadius={70} innerRadius={35}>
                    {charts.expensesByCategory.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: any) => [`S/ ${Number(v).toFixed(0)}`, ""]} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1.5 mt-2">
                {charts.expensesByCategory.slice(0, 4).map((e, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                      <span className="text-muted-foreground capitalize">{e.category}</span>
                    </div>
                    <span className="font-semibold">S/ {e.total.toFixed(0)}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="h-[220px] flex items-center justify-center text-muted-foreground text-sm text-center">Sin gastos registrados aún.</div>
          )}
        </div>
      </div>

      {/* Top campaigns bar chart */}
      <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
        <h3 className="font-bold mb-1">Campañas con mayor recaudación</h3>
        <p className="text-xs text-muted-foreground mb-5">Top 5 campañas por monto recaudado</p>
        {charts.topCampaigns.length > 0 ? (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={charts.topCampaigns} layout="vertical" margin={{ left: 10, right: 20 }}>
              <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
              <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={v => `S/${v}`} />
              <YAxis dataKey="title" type="category" tick={{ fontSize: 11 }} width={160} />
              <Tooltip formatter={(v: any) => [`S/ ${Number(v).toFixed(0)}`, ""]} />
              <Bar dataKey="raised" fill="#ef4444" radius={[0, 4, 4, 0]} name="Recaudado" />
              <Bar dataKey="goal" fill="#fecaca" radius={[0, 4, 4, 0]} name="Meta" />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">Sin campañas aún.</div>
        )}
      </div>

      {/* Recent activity grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent donations */}
        <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold">Últimas donaciones</h3>
            <Link href="/admin/donaciones"><span className="text-xs text-primary hover:underline cursor-pointer">Ver todas →</span></Link>
          </div>
          <div className="space-y-2">
            {recent.donations.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Sin donaciones aún.</p>
            ) : recent.donations.map(d => (
              <div key={d.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                <div>
                  <p className="text-sm font-medium">{d.name}</p>
                  <p className="text-xs text-muted-foreground">{d.method} • {new Date(d.createdAt).toLocaleDateString("es-PE")}</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-sm">S/ {d.amount.toFixed(0)}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_BADGE[d.status] || "bg-secondary"}`}>{d.status}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent volunteers + messages */}
        <div className="space-y-4">
          <div className="bg-card border border-border rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-sm">Nuevos voluntarios</h3>
              <Link href="/admin/voluntarios"><span className="text-xs text-primary hover:underline cursor-pointer">Ver todos →</span></Link>
            </div>
            <div className="space-y-2">
              {recent.volunteers.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin nuevos voluntarios.</p>
              ) : recent.volunteers.map(v => (
                <div key={v.id} className="flex items-center justify-between text-sm py-1.5 border-b border-border last:border-0">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                      {v.name.charAt(0)}
                    </div>
                    <span className="font-medium">{v.name}</span>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_BADGE[v.status] || "bg-secondary"}`}>{v.status}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-card border border-border rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-sm">Mensajes de contacto</h3>
              <Link href="/admin/mensajes"><span className="text-xs text-primary hover:underline cursor-pointer">Ver todos →</span></Link>
            </div>
            <div className="space-y-2">
              {recent.messages.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin mensajes.</p>
              ) : recent.messages.map(m => (
                <div key={m.id} className="flex items-start gap-2 py-1.5 border-b border-border last:border-0">
                  <MessageSquare className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium">{m.name}</p>
                    {m.subject && <p className="text-xs text-muted-foreground">{m.subject}</p>}
                  </div>
                  <span className="text-xs text-muted-foreground ml-auto shrink-0">{new Date(m.createdAt).toLocaleDateString("es-PE")}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  AlertTriangle, Heart, Baby, PersonStanding, Cat, Home, Zap,
  Clock, MapPin, Eye, CheckCircle, XCircle, RefreshCw, Archive,
  Target, Search, Filter, Star
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface CommunityReport {
  id: number;
  type: string;
  title: string;
  description: string;
  location: string;
  urgency: string;
  photos: string[] | null;
  reporterName: string;
  reporterPhone: string | null;
  reporterEmail: string | null;
  isAnonymous: boolean;
  status: string;
  adminNotes: string | null;
  campaignId: number | null;
  featuredOnHome: boolean;
  createdAt: string;
}

const TYPE_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  "familia-vulnerable": { label: "Familia vulnerable", icon: Heart, color: "bg-pink-100 text-pink-700" },
  "nino-necesidad": { label: "Niño en necesidad", icon: Baby, color: "bg-blue-100 text-blue-700" },
  "adulto-mayor": { label: "Adulto mayor", icon: PersonStanding, color: "bg-purple-100 text-purple-700" },
  "animal-herido": { label: "Animal herido", icon: Cat, color: "bg-orange-100 text-orange-700" },
  "albergue": { label: "Albergue", icon: Home, color: "bg-green-100 text-green-700" },
  "emergencia-comunitaria": { label: "Emergencia", icon: Zap, color: "bg-red-100 text-red-700" },
};

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  pending: { label: "Pendiente", color: "bg-yellow-100 text-yellow-800" },
  reviewing: { label: "En revisión", color: "bg-blue-100 text-blue-800" },
  approved: { label: "Aprobado", color: "bg-green-100 text-green-800" },
  rejected: { label: "Rechazado", color: "bg-red-100 text-red-800" },
  converted: { label: "→ Campaña", color: "bg-purple-100 text-purple-800" },
  archived: { label: "Archivado", color: "bg-secondary text-muted-foreground" },
};

const URGENCY_DOT: Record<string, string> = {
  low: "bg-green-500",
  medium: "bg-yellow-500",
  high: "bg-orange-500",
  critical: "bg-red-500 animate-pulse",
};

const STATUS_FILTERS = [
  { value: "all", label: "Todos" },
  { value: "pending", label: "Pendientes" },
  { value: "reviewing", label: "En revisión" },
  { value: "approved", label: "Aprobados" },
  { value: "rejected", label: "Rechazados" },
  { value: "converted", label: "Convertidos" },
  { value: "archived", label: "Archivados" },
];

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "Hoy";
  if (days === 1) return "Ayer";
  if (days < 7) return `Hace ${days} días`;
  return `Hace ${Math.floor(days / 7)} sem.`;
}

export default function AdminReports() {
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: reports = [], isLoading } = useQuery<CommunityReport[]>({
    queryKey: ["/api/admin/reports", statusFilter],
    queryFn: async () => {
      const url = statusFilter === "all" ? "/api/admin/reports" : `/api/admin/reports?status=${statusFilter}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Error cargando reportes");
      return res.json();
    },
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const res = await fetch(`/api/admin/reports/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Error actualizando estado");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/reports"] });
      toast({ title: "Estado actualizado" });
    },
    onError: () => toast({ title: "Error", variant: "destructive" }),
  });

  const toggleFeatured = useMutation({
    mutationFn: async ({ id, featuredOnHome }: { id: number; featuredOnHome: boolean }) => {
      const res = await fetch(`/api/admin/reports/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ featuredOnHome }),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/reports"] });
    },
  });

  const filtered = reports.filter(r =>
    !search ||
    r.title.toLowerCase().includes(search.toLowerCase()) ||
    r.location.toLowerCase().includes(search.toLowerCase()) ||
    r.reporterName.toLowerCase().includes(search.toLowerCase())
  );

  const pendingCount = reports.filter(r => r.status === "pending").length;

  return (
    <div className="p-6 sm:p-8 max-w-7xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-display font-black">Reportes Ciudadanos</h1>
          <p className="text-muted-foreground mt-1">Casos reportados por la comunidad de Chanchamayo</p>
        </div>
        {pendingCount > 0 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-2xl px-5 py-3 flex items-center gap-2">
            <span className="w-2.5 h-2.5 bg-yellow-500 rounded-full animate-pulse" />
            <span className="font-semibold text-yellow-800 text-sm">{pendingCount} reporte{pendingCount > 1 ? "s" : ""} pendiente{pendingCount > 1 ? "s" : ""}</span>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar reportes..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10 rounded-xl bg-secondary/30" />
        </div>
        <div className="flex gap-2 flex-wrap">
          {STATUS_FILTERS.map(f => (
            <button
              key={f.value}
              onClick={() => setStatusFilter(f.value)}
              className={`px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${
                statusFilter === f.value ? "bg-primary text-white shadow-sm" : "bg-secondary text-muted-foreground hover:bg-secondary/80"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="bg-card rounded-2xl border border-border p-5 animate-pulse h-24" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <AlertTriangle className="w-12 h-12 mx-auto mb-3 opacity-20" />
          <p className="font-medium">No hay reportes{search ? " que coincidan con la búsqueda" : " en este estado"}.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(report => {
            const typeConfig = TYPE_CONFIG[report.type] || { label: report.type, icon: AlertTriangle, color: "bg-secondary text-foreground" };
            const statusConf = STATUS_CONFIG[report.status] || { label: report.status, color: "bg-secondary text-foreground" };
            const TypeIcon = typeConfig.icon;

            return (
              <div key={report.id} className="bg-card border border-border rounded-2xl p-5 hover:shadow-sm transition-shadow">
                <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                  {/* Photo thumbnail */}
                  <div className="shrink-0 w-16 h-16 rounded-xl overflow-hidden bg-secondary flex items-center justify-center">
                    {report.photos?.[0] ? (
                      <img src={report.photos[0]} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <TypeIcon className="w-7 h-7 text-muted-foreground" />
                    )}
                  </div>

                  {/* Main info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1.5">
                      <span className={`w-2 h-2 rounded-full ${URGENCY_DOT[report.urgency] || "bg-secondary"}`} />
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${typeConfig.color}`}>
                        {typeConfig.label}
                      </span>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${statusConf.color}`}>
                        {statusConf.label}
                      </span>
                      {report.featuredOnHome && (
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 flex items-center gap-1">
                          <Star className="w-3 h-3" /> Destacado
                        </span>
                      )}
                      {report.campaignId && (
                        <Link href={`/admin/campanas/${report.campaignId}`}>
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 flex items-center gap-1 cursor-pointer hover:bg-purple-200">
                            <Target className="w-3 h-3" /> Campaña #{report.campaignId}
                          </span>
                        </Link>
                      )}
                    </div>
                    <h3 className="font-bold text-base leading-snug">{report.title}</h3>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground mt-1">
                      <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{report.location}</span>
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{timeAgo(report.createdAt)}</span>
                      <span>Por: {report.isAnonymous ? "Anónimo" : report.reporterName}</span>
                      {report.reporterPhone && <span>📞 {report.reporterPhone}</span>}
                    </div>
                    {report.adminNotes && (
                      <p className="text-xs text-muted-foreground mt-1 italic">Nota: {report.adminNotes}</p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex flex-wrap sm:flex-col gap-2 shrink-0">
                    <Link href={`/admin/reportes/${report.id}`}>
                      <Button variant="outline" size="sm" className="rounded-xl h-8 text-xs">
                        <Eye className="w-3.5 h-3.5 mr-1" /> Revisar
                      </Button>
                    </Link>
                    {report.status === "pending" && (
                      <Button
                        size="sm"
                        className="rounded-xl h-8 text-xs bg-blue-600 hover:bg-blue-700"
                        onClick={() => updateStatus.mutate({ id: report.id, status: "reviewing" })}
                        disabled={updateStatus.isPending}
                      >
                        <RefreshCw className="w-3.5 h-3.5 mr-1" /> En revisión
                      </Button>
                    )}
                    {(report.status === "pending" || report.status === "reviewing") && (
                      <>
                        <Button
                          size="sm"
                          className="rounded-xl h-8 text-xs bg-green-600 hover:bg-green-700"
                          onClick={() => updateStatus.mutate({ id: report.id, status: "approved" })}
                          disabled={updateStatus.isPending}
                        >
                          <CheckCircle className="w-3.5 h-3.5 mr-1" /> Aprobar
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="rounded-xl h-8 text-xs text-destructive border-destructive/30 hover:bg-destructive/10"
                          onClick={() => updateStatus.mutate({ id: report.id, status: "rejected" })}
                          disabled={updateStatus.isPending}
                        >
                          <XCircle className="w-3.5 h-3.5 mr-1" /> Rechazar
                        </Button>
                      </>
                    )}
                    {report.status === "approved" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className={`rounded-xl h-8 text-xs ${report.featuredOnHome ? "bg-amber-50 border-amber-300 text-amber-700" : ""}`}
                        onClick={() => toggleFeatured.mutate({ id: report.id, featuredOnHome: !report.featuredOnHome })}
                      >
                        <Star className="w-3.5 h-3.5 mr-1" /> {report.featuredOnHome ? "Quitar" : "Destacar"}
                      </Button>
                    )}
                    {report.status !== "archived" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="rounded-xl h-8 text-xs text-muted-foreground"
                        onClick={() => updateStatus.mutate({ id: report.id, status: "archived" })}
                        disabled={updateStatus.isPending}
                      >
                        <Archive className="w-3.5 h-3.5 mr-1" /> Archivar
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

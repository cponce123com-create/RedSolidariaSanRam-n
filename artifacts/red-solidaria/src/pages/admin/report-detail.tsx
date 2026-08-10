import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useParams, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, Heart, Baby, PersonStanding, Cat, Home, Zap, AlertTriangle,
  MapPin, Clock, Phone, Mail, User, Camera, CheckCircle, XCircle,
  RefreshCw, Archive, Target, Star, ExternalLink, Edit3, ChevronDown
} from "lucide-react";

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
  updatedAt: string;
}

const TYPE_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  "familia-vulnerable": { label: "Familia vulnerable", icon: Heart, color: "bg-pink-100 text-pink-700" },
  "nino-necesidad": { label: "Niño en necesidad", icon: Baby, color: "bg-blue-100 text-blue-700" },
  "adulto-mayor": { label: "Adulto mayor", icon: PersonStanding, color: "bg-purple-100 text-purple-700" },
  "animal-herido": { label: "Animal herido", icon: Cat, color: "bg-orange-100 text-orange-700" },
  "albergue": { label: "Albergue", icon: Home, color: "bg-green-100 text-green-700" },
  "emergencia-comunitaria": { label: "Emergencia", icon: Zap, color: "bg-red-100 text-red-700" },
};

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: "Pendiente", color: "text-yellow-800", bg: "bg-yellow-100 border-yellow-200" },
  reviewing: { label: "En revisión", color: "text-blue-800", bg: "bg-blue-100 border-blue-200" },
  approved: { label: "Aprobado", color: "text-green-800", bg: "bg-green-100 border-green-200" },
  rejected: { label: "Rechazado", color: "text-red-800", bg: "bg-red-100 border-red-200" },
  converted: { label: "Convertido en campaña", color: "text-purple-800", bg: "bg-purple-100 border-purple-200" },
  archived: { label: "Archivado", color: "text-foreground", bg: "bg-secondary border-border" },
};

const URGENCY_CONFIG: Record<string, { label: string; color: string }> = {
  low: { label: "Urgencia baja", color: "text-green-700 bg-green-100" },
  medium: { label: "Urgencia media", color: "text-yellow-700 bg-yellow-100" },
  high: { label: "Urgencia alta", color: "text-orange-700 bg-orange-100" },
  critical: { label: "EMERGENCIA CRÍTICA", color: "text-red-700 bg-red-100" },
};

const CAMPAIGN_CATEGORIES = ["general", "salud", "educación", "alimentación", "vivienda", "emergencia", "animales"];

export default function AdminReportDetail() {
  const { id } = useParams();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [adminNotes, setAdminNotes] = useState("");
  const [showConvertForm, setShowConvertForm] = useState(false);
  const [convertData, setConvertData] = useState({ title: "", description: "", goal: "1000", category: "general", imageUrl: "" });

  const { data: report, isLoading } = useQuery<CommunityReport>({
    queryKey: ["/api/admin/reports", id],
    queryFn: async () => {
      const res = await fetch(`/api/admin/reports/${id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Error cargando reporte");
      return res.json();
    },
  });

  useEffect(() => {
    if (!report) return;
    setAdminNotes(report.adminNotes || "");
    setConvertData(prev => ({
      ...prev,
      title: report.title,
      description: report.description,
      imageUrl: report.photos?.[0] || "",
    }));
  }, [report]);

  const update = useMutation({
    mutationFn: async (data: object) => {
      const res = await fetch(`/api/admin/reports/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Error");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/reports"] });
      toast({ title: "Reporte actualizado" });
    },
    onError: () => toast({ title: "Error", variant: "destructive" }),
  });

  const convertToCampaign = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/admin/reports/${id}/convert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ...convertData, goal: Number(convertData.goal) }),
      });
      if (!res.ok) throw new Error("Error convirtiendo");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/reports"] });
      toast({ title: "¡Campaña creada!", description: `Campaña #${data.campaign.id} creada exitosamente.` });
      setShowConvertForm(false);
      setLocation(`/admin/campanas/${data.campaign.id}`);
    },
    onError: () => toast({ title: "Error al convertir", variant: "destructive" }),
  });

  if (isLoading) {
    return (
      <div className="p-8 max-w-4xl">
        <div className="animate-pulse space-y-6">
          <div className="h-10 bg-secondary rounded-2xl w-64" />
          <div className="h-64 bg-secondary rounded-3xl" />
          <div className="h-40 bg-secondary rounded-3xl" />
        </div>
      </div>
    );
  }
  if (!report) return <div className="p-8 text-muted-foreground">Reporte no encontrado.</div>;

  const typeConfig = TYPE_CONFIG[report.type] || { label: report.type, icon: AlertTriangle, color: "bg-secondary text-foreground" };
  const TypeIcon = typeConfig.icon;
  const statusConf = STATUS_CONFIG[report.status] || { label: report.status, color: "text-foreground", bg: "bg-secondary border-border" };
  const urgencyConf = URGENCY_CONFIG[report.urgency] || URGENCY_CONFIG.medium;

  return (
    <div className="p-6 sm:p-8 max-w-4xl">
      {/* Header */}
      <div className="mb-8">
        <Link href="/admin/reportes">
          <button className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-5 transition-colors">
            <ArrowLeft className="w-4 h-4" /> Volver a reportes
          </button>
        </Link>
        <div className="flex flex-wrap items-center gap-3 mb-3">
          <span className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold border ${statusConf.bg} ${statusConf.color}`}>
            {statusConf.label}
          </span>
          <span className={`px-3 py-1.5 rounded-full text-sm font-semibold ${typeConfig.color}`}>
            <TypeIcon className="w-4 h-4 inline mr-1" />{typeConfig.label}
          </span>
          <span className={`px-3 py-1.5 rounded-full text-sm font-semibold ${urgencyConf.color}`}>
            {urgencyConf.label}
          </span>
          {report.featuredOnHome && (
            <span className="px-3 py-1.5 rounded-full text-sm font-semibold bg-amber-100 text-amber-700 flex items-center gap-1.5">
              <Star className="w-3.5 h-3.5" /> Destacado en home
            </span>
          )}
        </div>
        <h1 className="text-3xl font-display font-black">{report.title}</h1>
        <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground mt-2">
          <span className="flex items-center gap-1"><MapPin className="w-4 h-4" />{report.location}</span>
          <span className="flex items-center gap-1"><Clock className="w-4 h-4" />{new Date(report.createdAt).toLocaleDateString("es-PE", { day: "numeric", month: "long", year: "numeric" })}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main column */}
        <div className="lg:col-span-2 space-y-6">
          {/* Description */}
          <div className="bg-card border border-border rounded-3xl p-6">
            <h2 className="font-bold text-lg mb-4">Descripción del caso</h2>
            <p className="text-foreground leading-relaxed whitespace-pre-wrap">{report.description}</p>
          </div>

          {/* Photos */}
          {report.photos && report.photos.length > 0 && (
            <div className="bg-card border border-border rounded-3xl p-6">
              <h2 className="font-bold text-lg mb-4 flex items-center gap-2"><Camera className="w-5 h-5 text-primary" /> Fotos ({report.photos.length})</h2>
              <div className="grid grid-cols-2 gap-3">
                {report.photos.map((photo, i) => (
                  <a key={i} href={photo} target="_blank" rel="noopener noreferrer" className="aspect-video bg-secondary rounded-2xl overflow-hidden block group relative">
                    <img src={photo} alt={`Foto ${i + 1}`} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                      <ExternalLink className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Admin notes */}
          <div className="bg-card border border-border rounded-3xl p-6">
            <h2 className="font-bold text-lg mb-4 flex items-center gap-2"><Edit3 className="w-5 h-5 text-primary" /> Notas del equipo</h2>
            <Textarea
              value={adminNotes}
              onChange={e => setAdminNotes(e.target.value)}
              placeholder="Agrega notas internas sobre este caso: verificación en campo, contactos, seguimiento..."
              className="min-h-[100px] rounded-xl bg-secondary/30 mb-3 resize-none"
            />
            <Button
              size="sm"
              variant="outline"
              className="rounded-xl"
              onClick={() => update.mutate({ adminNotes })}
              disabled={update.isPending}
            >
              Guardar notas
            </Button>
          </div>

          {/* Convert to campaign */}
          {report.status !== "converted" && report.status !== "archived" && (
            <div className="bg-purple-50 border border-purple-200 rounded-3xl p-6">
              <button
                className="w-full flex items-center justify-between font-bold text-purple-800"
                onClick={() => setShowConvertForm(!showConvertForm)}
              >
                <span className="flex items-center gap-2"><Target className="w-5 h-5" /> Convertir en campaña</span>
                <ChevronDown className={`w-5 h-5 transition-transform ${showConvertForm ? "rotate-180" : ""}`} />
              </button>
              {showConvertForm && (
                <div className="mt-5 space-y-4">
                  <p className="text-sm text-purple-700">Se creará una campaña pública a partir de este reporte.</p>
                  <div>
                    <label className="text-sm font-medium text-purple-800 block mb-1.5">Título de la campaña</label>
                    <Input value={convertData.title} onChange={e => setConvertData(p => ({ ...p, title: e.target.value }))} className="rounded-xl bg-card/60" />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-purple-800 block mb-1.5">Descripción</label>
                    <Textarea value={convertData.description} onChange={e => setConvertData(p => ({ ...p, description: e.target.value }))} className="rounded-xl bg-card/60 min-h-[80px] resize-none" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-sm font-medium text-purple-800 block mb-1.5">Meta (S/)</label>
                      <Input type="number" value={convertData.goal} onChange={e => setConvertData(p => ({ ...p, goal: e.target.value }))} className="rounded-xl bg-card/60" />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-purple-800 block mb-1.5">Categoría</label>
                      <select value={convertData.category} onChange={e => setConvertData(p => ({ ...p, category: e.target.value }))} className="w-full h-10 px-3 rounded-xl border border-purple-200 bg-card/60 text-sm">
                        {CAMPAIGN_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-purple-800 block mb-1.5">URL de imagen (opcional)</label>
                    <Input value={convertData.imageUrl} onChange={e => setConvertData(p => ({ ...p, imageUrl: e.target.value }))} className="rounded-xl bg-card/60" placeholder="https://..." />
                  </div>
                  <Button
                    className="w-full rounded-xl bg-purple-600 hover:bg-purple-700"
                    onClick={() => convertToCampaign.mutate()}
                    disabled={convertToCampaign.isPending || !convertData.title}
                  >
                    {convertToCampaign.isPending ? "Creando campaña..." : <><Target className="w-4 h-4 mr-2" /> Crear campaña</>}
                  </Button>
                </div>
              )}
            </div>
          )}
          {report.campaignId && (
            <div className="bg-purple-50 border border-purple-200 rounded-3xl p-5 flex items-center justify-between">
              <div>
                <p className="font-semibold text-purple-800">Este reporte fue convertido en campaña</p>
                <p className="text-sm text-purple-600">Campaña #{report.campaignId}</p>
              </div>
              <Link href={`/admin/campanas/${report.campaignId}`}>
                <Button size="sm" className="rounded-xl bg-purple-600 hover:bg-purple-700">
                  <ExternalLink className="w-4 h-4 mr-1" /> Ver campaña
                </Button>
              </Link>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-5">
          {/* Reporter info */}
          <div className="bg-card border border-border rounded-3xl p-5">
            <h2 className="font-bold mb-4 flex items-center gap-2"><User className="w-4 h-4 text-primary" /> Reportante</h2>
            <div className="space-y-3 text-sm">
              <div>
                <p className="text-muted-foreground text-xs">Nombre</p>
                <p className="font-medium">{report.reporterName}</p>
                {report.isAnonymous && <p className="text-xs text-muted-foreground mt-0.5 italic">Pidió reserva pública</p>}
              </div>
              {report.reporterPhone && (
                <div>
                  <p className="text-muted-foreground text-xs">Celular</p>
                  <p className="font-medium flex items-center gap-1"><Phone className="w-3.5 h-3.5" />{report.reporterPhone}</p>
                </div>
              )}
              {report.reporterEmail && (
                <div>
                  <p className="text-muted-foreground text-xs">Email</p>
                  <a href={`mailto:${report.reporterEmail}`} className="font-medium text-primary flex items-center gap-1 hover:underline">
                    <Mail className="w-3.5 h-3.5" />{report.reporterEmail}
                  </a>
                </div>
              )}
            </div>
          </div>

          {/* Quick actions */}
          <div className="bg-card border border-border rounded-3xl p-5">
            <h2 className="font-bold mb-4">Acciones rápidas</h2>
            <div className="space-y-2">
              {(report.status === "pending" || report.status === "reviewing") && (
                <>
                  <Button
                    className="w-full rounded-xl bg-blue-600 hover:bg-blue-700"
                    size="sm"
                    onClick={() => update.mutate({ status: "reviewing" })}
                    disabled={report.status === "reviewing" || update.isPending}
                  >
                    <RefreshCw className="w-4 h-4 mr-2" /> Marcar en revisión
                  </Button>
                  <Button
                    className="w-full rounded-xl bg-green-600 hover:bg-green-700"
                    size="sm"
                    onClick={() => update.mutate({ status: "approved" })}
                    disabled={update.isPending}
                  >
                    <CheckCircle className="w-4 h-4 mr-2" /> Aprobar caso
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full rounded-xl border-destructive/30 text-destructive hover:bg-destructive/10"
                    size="sm"
                    onClick={() => update.mutate({ status: "rejected" })}
                    disabled={update.isPending}
                  >
                    <XCircle className="w-4 h-4 mr-2" /> Rechazar
                  </Button>
                </>
              )}
              {report.status === "approved" && (
                <Button
                  variant="outline"
                  className={`w-full rounded-xl ${report.featuredOnHome ? "bg-amber-50 border-amber-300 text-amber-700" : ""}`}
                  size="sm"
                  onClick={() => update.mutate({ featuredOnHome: !report.featuredOnHome })}
                  disabled={update.isPending}
                >
                  <Star className="w-4 h-4 mr-2" /> {report.featuredOnHome ? "Quitar del home" : "Destacar en home"}
                </Button>
              )}
              {report.status !== "archived" && (
                <Button
                  variant="ghost"
                  className="w-full rounded-xl text-muted-foreground"
                  size="sm"
                  onClick={() => { update.mutate({ status: "archived" }); setLocation("/admin/reportes"); }}
                  disabled={update.isPending}
                >
                  <Archive className="w-4 h-4 mr-2" /> Archivar
                </Button>
              )}
            </div>
          </div>

          {/* Timeline */}
          <div className="bg-card border border-border rounded-3xl p-5">
            <h2 className="font-bold mb-3 text-sm">Fechas</h2>
            <div className="space-y-2 text-xs text-muted-foreground">
              <div className="flex justify-between">
                <span>Recibido</span>
                <span className="font-medium text-foreground">{new Date(report.createdAt).toLocaleDateString("es-PE")}</span>
              </div>
              <div className="flex justify-between">
                <span>Última actualización</span>
                <span className="font-medium text-foreground">{new Date(report.updatedAt).toLocaleDateString("es-PE")}</span>
              </div>
              <div className="flex justify-between">
                <span>ID del reporte</span>
                <span className="font-medium text-foreground">#{report.id}</span>
              </div>
            </div>
          </div>

          {/* Public view link */}
          {report.status === "approved" && (
            <Link href="/casos-urgentes">
              <Button variant="outline" className="w-full rounded-xl" size="sm">
                <ExternalLink className="w-4 h-4 mr-2" /> Ver en página pública
              </Button>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

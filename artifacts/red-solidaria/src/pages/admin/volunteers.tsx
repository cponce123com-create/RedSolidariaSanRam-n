import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  Search, Check, X, Clock, Phone, Mail, MapPin,
  Calendar, Star, MessageSquare, ChevronDown, ChevronUp, Users
} from "lucide-react";

interface Volunteer {
  id: number; name: string; email: string; phone: string | null;
  age: string | null; district: string | null; availability: string;
  skills: string | null; interests: string | null; motivation: string | null;
  priorExperience: string | null; status: string; adminNotes: string | null;
  photo: string | null;
  createdAt: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  pending: { label: "Pendiente", color: "bg-yellow-100 text-yellow-800" },
  reviewing: { label: "En revisión", color: "bg-blue-100 text-blue-800" },
  approved: { label: "Aprobado", color: "bg-green-100 text-green-800" },
  contacted: { label: "Contactado", color: "bg-purple-100 text-purple-800" },
  rejected: { label: "No procede", color: "bg-red-100 text-red-800" },
};

const AVAILABILITY_LABELS: Record<string, string> = {
  "fines-semana": "Fines de semana",
  "entre-semana": "Entre semana",
  ambos: "Ambos días",
  eventos: "Solo eventos",
  remoto: "Remoto / redes",
};

const STATUS_FILTERS = [
  { value: "all", label: "Todos" },
  { value: "pending", label: "Pendientes" },
  { value: "reviewing", label: "En revisión" },
  { value: "approved", label: "Aprobados" },
  { value: "contacted", label: "Contactados" },
  { value: "rejected", label: "No procede" },
];

function VolunteerRow({ volunteer }: { volunteer: Volunteer }) {
  const [expanded, setExpanded] = useState(false);
  const [notes, setNotes] = useState(volunteer.adminNotes || "");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const updateStatus = useMutation({
    mutationFn: async (status: string) => {
      const res = await fetch(`/api/admin/volunteers/${volunteer.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status, adminNotes: notes }),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/volunteers"] });
      toast({ title: "Voluntario actualizado" });
    },
    onError: () => toast({ title: "Error", variant: "destructive" }),
  });

  const saveNotes = async () => {
    await updateStatus.mutateAsync(volunteer.status);
    toast({ title: "Notas guardadas" });
  };

  const conf = STATUS_CONFIG[volunteer.status] || STATUS_CONFIG.pending;

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      <div className="p-4 sm:p-5">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0 font-bold text-primary overflow-hidden">
            {volunteer.photo ? (
              <img src={volunteer.photo} alt={volunteer.name} className="w-full h-full object-cover" />
            ) : (
              volunteer.name.charAt(0).toUpperCase()
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div>
                <h3 className="font-bold">{volunteer.name}</h3>
                <div className="flex flex-wrap gap-3 mt-1 text-xs text-muted-foreground">
                  {volunteer.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{volunteer.email}</span>}
                  {volunteer.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{volunteer.phone}</span>}
                  {volunteer.district && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{volunteer.district}</span>}
                  {volunteer.age && <span>{volunteer.age}</span>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${conf.color}`}>{conf.label}</span>
                <button onClick={() => setExpanded(!expanded)} className="text-muted-foreground hover:text-foreground p-1">
                  {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
              <span className="text-xs bg-secondary px-2 py-0.5 rounded-full">
                <Clock className="w-3 h-3 inline mr-1" />
                {AVAILABILITY_LABELS[volunteer.availability] || volunteer.availability}
              </span>
              {volunteer.interests && volunteer.interests.split(",").slice(0, 2).map(i => (
                <span key={i} className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">{i.trim()}</span>
              ))}
              <span className="text-xs text-muted-foreground ml-auto">
                {new Date(volunteer.createdAt).toLocaleDateString("es-PE")}
              </span>
            </div>
          </div>
        </div>

        {expanded && (
          <div className="mt-5 space-y-4 border-t border-border pt-5">
            {volunteer.motivation && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Motivación</p>
                <p className="text-sm text-muted-foreground bg-secondary/40 rounded-xl p-3">{volunteer.motivation}</p>
              </div>
            )}
            {volunteer.skills && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Habilidades</p>
                <p className="text-sm">{volunteer.skills}</p>
              </div>
            )}
            {volunteer.priorExperience && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Experiencia previa</p>
                <p className="text-sm">{volunteer.priorExperience}</p>
              </div>
            )}

            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Notas internas</p>
              <Textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Notas del equipo sobre este voluntario..."
                className="min-h-[70px] rounded-xl text-sm resize-none bg-secondary/30"
              />
              <Button size="sm" variant="outline" className="mt-2 rounded-xl text-xs" onClick={saveNotes} disabled={updateStatus.isPending}>
                <MessageSquare className="w-3.5 h-3.5 mr-1" /> Guardar notas
              </Button>
            </div>

            <div className="flex flex-wrap gap-2">
              <p className="w-full text-xs font-semibold text-muted-foreground uppercase tracking-wider">Cambiar estado</p>
              {volunteer.status === "pending" && (
                <Button size="sm" className="rounded-xl h-8 text-xs bg-blue-600 hover:bg-blue-700" onClick={() => updateStatus.mutate("reviewing")} disabled={updateStatus.isPending}>
                  <Clock className="w-3.5 h-3.5 mr-1" /> En revisión
                </Button>
              )}
              {volunteer.status !== "approved" && volunteer.status !== "rejected" && (
                <Button size="sm" className="rounded-xl h-8 text-xs bg-green-600 hover:bg-green-700" onClick={() => updateStatus.mutate("approved")} disabled={updateStatus.isPending}>
                  <Check className="w-3.5 h-3.5 mr-1" /> Aprobar
                </Button>
              )}
              {volunteer.status === "approved" && (
                <Button size="sm" className="rounded-xl h-8 text-xs bg-purple-600 hover:bg-purple-700" onClick={() => updateStatus.mutate("contacted")} disabled={updateStatus.isPending}>
                  <Phone className="w-3.5 h-3.5 mr-1" /> Marcar contactado
                </Button>
              )}
              {volunteer.status !== "rejected" && (
                <Button size="sm" variant="outline" className="rounded-xl h-8 text-xs text-destructive border-destructive/30" onClick={() => updateStatus.mutate("rejected")} disabled={updateStatus.isPending}>
                  <X className="w-3.5 h-3.5 mr-1" /> No procede
                </Button>
              )}
              {volunteer.phone && (
                <a href={`https://wa.me/51${volunteer.phone.replace(/\s/g, "")}`} target="_blank" rel="noopener noreferrer">
                  <Button size="sm" className="rounded-xl h-8 text-xs bg-green-500 hover:bg-green-600 ml-auto">
                    <Phone className="w-3.5 h-3.5 mr-1" /> WhatsApp
                  </Button>
                </a>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function AdminVolunteers() {
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");

  const { data: volunteers = [], isLoading } = useQuery<Volunteer[]>({
    queryKey: ["/api/admin/volunteers", statusFilter],
    queryFn: async () => {
      const url = statusFilter === "all" ? "/api/admin/volunteers" : `/api/admin/volunteers?status=${statusFilter}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Error");
      return res.json();
    },
  });

  const filtered = volunteers.filter(v =>
    !search ||
    v.name.toLowerCase().includes(search.toLowerCase()) ||
    v.email.toLowerCase().includes(search.toLowerCase()) ||
    (v.district || "").toLowerCase().includes(search.toLowerCase())
  );

  const pendingCount = volunteers.filter(v => v.status === "pending").length;

  return (
    <div className="p-6 sm:p-8 max-w-4xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-display font-black">Voluntariado</h1>
          <p className="text-muted-foreground mt-1">Gestión de postulaciones de voluntarios</p>
        </div>
        {pendingCount > 0 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-2 flex items-center gap-2">
            <span className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse" />
            <span className="font-semibold text-yellow-800 text-sm">{pendingCount} nueva{pendingCount > 1 ? "s" : ""} postulación{pendingCount > 1 ? "es" : ""}</span>
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Total", value: volunteers.length, color: "text-foreground" },
          { label: "Pendientes", value: volunteers.filter(v => v.status === "pending").length, color: "text-yellow-700" },
          { label: "Aprobados", value: volunteers.filter(v => v.status === "approved" || v.status === "contacted").length, color: "text-green-600" },
          { label: "Rechazados", value: volunteers.filter(v => v.status === "rejected").length, color: "text-red-600" },
        ].map((stat, i) => (
          <div key={i} className="bg-card border border-border rounded-2xl p-4 text-center">
            <p className={`text-2xl font-display font-bold ${stat.color}`}>{stat.value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="relative max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar voluntario..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10 rounded-xl bg-secondary/30" />
        </div>
        <div className="flex gap-2 flex-wrap">
          {STATUS_FILTERS.map(f => (
            <button key={f.value} onClick={() => setStatusFilter(f.value)}
              className={`px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${statusFilter === f.value ? "bg-primary text-white shadow-sm" : "bg-secondary text-muted-foreground hover:bg-secondary/80"}`}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => <div key={i} className="bg-card border border-border rounded-2xl h-24 animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Users className="w-12 h-12 mx-auto mb-3 opacity-20" />
          <p className="font-medium">No hay voluntarios{search ? " que coincidan" : " en este estado"}.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(v => <VolunteerRow key={v.id} volunteer={v} />)}
        </div>
      )}
    </div>
  );
}

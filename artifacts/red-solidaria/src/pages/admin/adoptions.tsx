import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dog, Cat, Plus, Search, Eye, Check, X, AlertTriangle,
  Syringe, Scissors, Shield, Edit2, Trash2, Star
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Pet {
  id: number; name: string; species: string; breed: string | null;
  sex: string; ageCategory: string; size: string; photos: string[] | null;
  vaccinated: boolean; sterilized: boolean; dewormed: boolean;
  urgent: boolean; status: string; location: string;
  submittedByPublic: boolean; createdAt: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  reviewing: { label: "En revisión", color: "bg-yellow-100 text-yellow-800" },
  available: { label: "Disponible", color: "bg-green-100 text-green-800" },
  "in-process": { label: "En proceso", color: "bg-blue-100 text-blue-800" },
  adopted: { label: "Adoptado", color: "bg-purple-100 text-purple-800" },
};

const STATUS_FILTERS = [
  { value: "all", label: "Todos" },
  { value: "reviewing", label: "En revisión" },
  { value: "available", label: "Disponibles" },
  { value: "in-process", label: "En proceso" },
  { value: "adopted", label: "Adoptados" },
];

const SIZE_LABELS: Record<string, string> = { small: "Peq.", medium: "Med.", large: "Gran.", giant: "Gig." };
const AGE_LABELS: Record<string, string> = { puppy: "Cachorro", adult: "Adulto", senior: "Mayor" };

export default function AdminAdoptions() {
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: pets = [], isLoading } = useQuery<Pet[]>({
    queryKey: ["/api/admin/pets", statusFilter],
    queryFn: async () => {
      const url = statusFilter === "all" ? "/api/admin/pets" : `/api/admin/pets?status=${statusFilter}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Error cargando mascotas");
      return res.json();
    },
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const res = await fetch(`/api/admin/pets/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Error");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pets"] });
      toast({ title: "Estado actualizado" });
    },
    onError: () => toast({ title: "Error", variant: "destructive" }),
  });

  const deletePet = useMutation({
    mutationFn: async (id: number) => {
      await fetch(`/api/admin/pets/${id}`, { method: "DELETE", credentials: "include" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pets"] });
      toast({ title: "Mascota eliminada" });
    },
  });

  const filtered = pets.filter(p =>
    !search ||
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.species.toLowerCase().includes(search.toLowerCase()) ||
    (p.breed || "").toLowerCase().includes(search.toLowerCase()) ||
    p.location.toLowerCase().includes(search.toLowerCase())
  );

  const reviewingCount = pets.filter(p => p.status === "reviewing").length;

  return (
    <div className="p-6 sm:p-8 max-w-7xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-display font-black">Panel de Adopciones</h1>
          <p className="text-muted-foreground mt-1">Mascotas disponibles y en proceso de adopción</p>
        </div>
        <div className="flex items-center gap-3">
          {reviewingCount > 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-2 flex items-center gap-2">
              <span className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse" />
              <span className="font-semibold text-yellow-800 text-sm">{reviewingCount} pendiente{reviewingCount > 1 ? "s" : ""} de revisión</span>
            </div>
          )}
          <Link href="/admin/adopciones/nueva">
            <Button className="rounded-xl gap-2">
              <Plus className="w-4 h-4" /> Nueva mascota
            </Button>
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="relative max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar mascotas..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10 rounded-xl bg-secondary/30" />
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

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {[...Array(6)].map((_, i) => <div key={i} className="bg-card border border-border rounded-2xl h-52 animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Dog className="w-12 h-12 mx-auto mb-3 opacity-20" />
          <p className="font-medium">No hay mascotas{search ? " que coincidan" : " en este estado"}.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map(pet => {
            const SpeciesIcon = pet.species === "gato" ? Cat : Dog;
            const statusConf = STATUS_CONFIG[pet.status] || { label: pet.status, color: "bg-secondary text-foreground" };
            const photo = pet.photos?.[0];

            return (
              <div key={pet.id} className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                <div className="aspect-video bg-secondary relative overflow-hidden">
                  {photo ? (
                    <img src={photo} alt={pet.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center"><SpeciesIcon className="w-16 h-16 text-muted-foreground opacity-20" /></div>
                  )}
                  {pet.urgent && (
                    <div className="absolute top-2 left-2 bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full animate-pulse">URGENTE</div>
                  )}
                  {pet.submittedByPublic && (
                    <div className="absolute top-2 right-2 bg-blue-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">Público</div>
                  )}
                </div>

                <div className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h3 className="font-bold text-base">{pet.name}</h3>
                      <p className="text-xs text-muted-foreground">{pet.species === "gato" ? "Gato" : "Perro"} · {AGE_LABELS[pet.ageCategory] || pet.ageCategory} · {SIZE_LABELS[pet.size] || pet.size}</p>
                    </div>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${statusConf.color}`}>{statusConf.label}</span>
                  </div>

                  <div className="flex gap-2 mb-3">
                    {pet.vaccinated && <span className="text-green-600 text-xs flex items-center gap-0.5"><Syringe className="w-3 h-3" /></span>}
                    {pet.sterilized && <span className="text-blue-600 text-xs flex items-center gap-0.5"><Scissors className="w-3 h-3" /></span>}
                    {pet.dewormed && <span className="text-purple-600 text-xs flex items-center gap-0.5"><Shield className="w-3 h-3" /></span>}
                    <span className="text-xs text-muted-foreground ml-auto">{pet.location}</span>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    <Link href={`/admin/adopciones/${pet.id}`}>
                      <Button size="sm" variant="outline" className="rounded-lg h-7 text-xs px-2">
                        <Eye className="w-3 h-3 mr-1" /> Ver
                      </Button>
                    </Link>
                    {pet.status === "reviewing" && (
                      <Button size="sm" className="rounded-lg h-7 text-xs px-2 bg-green-600 hover:bg-green-700"
                        onClick={() => updateStatus.mutate({ id: pet.id, status: "available" })}
                        disabled={updateStatus.isPending}>
                        <Check className="w-3 h-3 mr-1" /> Aprobar
                      </Button>
                    )}
                    {pet.status === "available" && (
                      <Button size="sm" className="rounded-lg h-7 text-xs px-2 bg-blue-600 hover:bg-blue-700"
                        onClick={() => updateStatus.mutate({ id: pet.id, status: "in-process" })}
                        disabled={updateStatus.isPending}>
                        En proceso
                      </Button>
                    )}
                    {pet.status === "in-process" && (
                      <Button size="sm" className="rounded-lg h-7 text-xs px-2 bg-purple-600 hover:bg-purple-700"
                        onClick={() => updateStatus.mutate({ id: pet.id, status: "adopted" })}
                        disabled={updateStatus.isPending}>
                        <Check className="w-3 h-3 mr-1" /> Adoptado
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" className="rounded-lg h-7 text-xs px-2 text-destructive hover:bg-destructive/10 ml-auto"
                      onClick={() => { if (confirm(`¿Eliminar a ${pet.name}?`)) deletePet.mutate(pet.id); }}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Adoption requests section */}
      <div className="mt-12">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-display font-bold">Solicitudes de adopción</h2>
          <Link href="/admin/adopciones/solicitudes">
            <Button variant="outline" className="rounded-xl">Ver todas →</Button>
          </Link>
        </div>
        <AdminAdoptionRequestsPreview />
      </div>
    </div>
  );
}

function AdminAdoptionRequestsPreview() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: requests = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/admin/adoption-requests"],
    queryFn: async () => {
      const res = await fetch("/api/admin/adoption-requests?status=pending", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const updateRequest = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const res = await fetch(`/api/admin/adoption-requests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status }),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/adoption-requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pets"] });
      toast({ title: "Solicitud actualizada" });
    },
  });

  if (isLoading) return <div className="h-24 bg-secondary rounded-2xl animate-pulse" />;
  if (requests.length === 0) return (
    <div className="bg-secondary/30 rounded-2xl p-6 text-center text-muted-foreground text-sm">
      No hay solicitudes pendientes de revisión.
    </div>
  );

  return (
    <div className="space-y-3">
      {requests.slice(0, 5).map((req: any) => (
        <div key={req.id} className="bg-card border border-border rounded-2xl p-4 flex items-start gap-4">
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm">{req.requesterName} quiere adoptar mascota #{req.petId}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {req.housingType} · {req.hasPetExperience ? "Con experiencia" : "Sin experiencia"} · {req.hasYard ? "Con patio" : "Sin patio"} · {new Date(req.createdAt).toLocaleDateString("es-PE")}
            </p>
            <p className="text-xs text-muted-foreground mt-1 line-clamp-1 italic">"{req.adoptionReason}"</p>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button size="sm" className="rounded-xl h-8 text-xs bg-green-600 hover:bg-green-700"
              onClick={() => updateRequest.mutate({ id: req.id, status: "approved" })}
              disabled={updateRequest.isPending}>
              <Check className="w-3.5 h-3.5 mr-1" /> Aprobar
            </Button>
            <Button size="sm" variant="outline" className="rounded-xl h-8 text-xs text-destructive border-destructive/30"
              onClick={() => updateRequest.mutate({ id: req.id, status: "rejected" })}
              disabled={updateRequest.isPending}>
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { motion } from "framer-motion";
import {
  Dog, Cat, Heart, Search, Filter, Plus, Star, Shield, Syringe,
  Scissors, AlertTriangle, MapPin, Check, SlidersHorizontal
} from "lucide-react";

interface Pet {
  id: number; name: string; species: string; breed: string | null;
  sex: string; ageCategory: string; ageApprox: string | null;
  size: string; photos: string[] | null; description: string;
  vaccinated: boolean; sterilized: boolean; dewormed: boolean;
  urgent: boolean; status: string; location: string;
  healthStatus: string; createdAt: string;
}

const SPECIES_ICON: Record<string, React.ElementType> = { perro: Dog, gato: Cat };

const SIZE_LABELS: Record<string, string> = {
  small: "Pequeño", medium: "Mediano", large: "Grande", giant: "Gigante",
};

const AGE_LABELS: Record<string, string> = {
  puppy: "Cachorro", adult: "Adulto", senior: "Adulto mayor",
};

const SEX_LABELS: Record<string, string> = { macho: "Macho", hembra: "Hembra" };

const HEALTH_COLORS: Record<string, string> = {
  excellent: "text-green-600", good: "text-green-500",
  fair: "text-yellow-600", needs_care: "text-orange-600",
};

function PetCard({ pet }: { pet: Pet }) {
  const photo = pet.photos?.[0];
  const SpeciesIcon = SPECIES_ICON[pet.species] || Dog;

  return (
    <motion.div
      whileHover={{ y: -4 }}
      className="bg-card border border-border rounded-3xl overflow-hidden shadow-sm hover:shadow-md transition-all flex flex-col"
    >
      <div className="aspect-[4/3] bg-secondary relative overflow-hidden">
        {photo ? (
          <img src={photo} alt={pet.name} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-orange-50 to-amber-50">
            <SpeciesIcon className="w-20 h-20 text-amber-300" />
          </div>
        )}
        {pet.urgent && (
          <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-red-500 text-white text-xs font-bold px-2.5 py-1 rounded-full animate-pulse">
            <AlertTriangle className="w-3 h-3" /> URGENTE
          </div>
        )}
        <div className="absolute top-3 right-3 bg-white/90 backdrop-blur-sm text-xs font-semibold px-2.5 py-1 rounded-full flex items-center gap-1">
          <SpeciesIcon className="w-3.5 h-3.5 text-amber-600" />
          {pet.species === "perro" ? "Perro" : "Gato"}
        </div>
        {pet.status === "in-process" && (
          <div className="absolute bottom-0 left-0 right-0 bg-blue-600/90 text-white text-xs font-bold text-center py-1.5">
            En proceso de adopción
          </div>
        )}
      </div>

      <div className="p-5 flex-1 flex flex-col gap-3">
        <div>
          <div className="flex items-center justify-between mb-1">
            <h3 className="font-display font-bold text-xl">{pet.name}</h3>
            <span className="text-xs text-muted-foreground">{SEX_LABELS[pet.sex] || pet.sex}</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
            <span className="bg-secondary px-2 py-0.5 rounded-full">{AGE_LABELS[pet.ageCategory] || pet.ageCategory}</span>
            <span className="bg-secondary px-2 py-0.5 rounded-full">{SIZE_LABELS[pet.size] || pet.size}</span>
            {pet.breed && <span className="text-muted-foreground/70">{pet.breed}</span>}
          </div>
        </div>

        <p className="text-muted-foreground text-sm leading-relaxed line-clamp-2">{pet.description}</p>

        <div className="flex items-center gap-3 text-xs flex-wrap">
          {pet.vaccinated && (
            <span className="flex items-center gap-1 text-green-700">
              <Syringe className="w-3.5 h-3.5" /> Vacunado
            </span>
          )}
          {pet.sterilized && (
            <span className="flex items-center gap-1 text-blue-600">
              <Scissors className="w-3.5 h-3.5" /> Esterilizado
            </span>
          )}
          {pet.dewormed && (
            <span className="flex items-center gap-1 text-purple-600">
              <Shield className="w-3.5 h-3.5" /> Desparasitado
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 text-xs text-muted-foreground mt-auto pt-2 border-t border-border">
          <MapPin className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">{pet.location}</span>
        </div>

        <Link href={`/adopciones/${pet.id}`}>
          <Button
            className={`w-full rounded-xl h-10 ${pet.status === "in-process" ? "bg-blue-600 hover:bg-blue-700" : ""}`}
            size="sm"
            disabled={pet.status === "adopted"}
          >
            {pet.status === "adopted" ? (
              <><Check className="w-4 h-4 mr-1" /> Ya adoptado</>
            ) : pet.status === "in-process" ? (
              <><Heart className="w-4 h-4 mr-1" /> Ver ficha</>
            ) : (
              <><Heart className="w-4 h-4 mr-1" /> Quiero adoptarlo</>
            )}
          </Button>
        </Link>
      </div>
    </motion.div>
  );
}

const FILTER_GROUPS = [
  {
    key: "species", label: "Especie", options: [
      { value: "", label: "Todos" }, { value: "perro", label: "Perros" }, { value: "gato", label: "Gatos" },
    ],
  },
  {
    key: "sex", label: "Sexo", options: [
      { value: "", label: "Ambos" }, { value: "macho", label: "Macho" }, { value: "hembra", label: "Hembra" },
    ],
  },
  {
    key: "ageCategory", label: "Edad", options: [
      { value: "", label: "Cualquier edad" }, { value: "puppy", label: "Cachorro" }, { value: "adult", label: "Adulto" }, { value: "senior", label: "Adulto mayor" },
    ],
  },
  {
    key: "size", label: "Tamaño", options: [
      { value: "", label: "Cualquier tamaño" }, { value: "small", label: "Pequeño" }, { value: "medium", label: "Mediano" }, { value: "large", label: "Grande" },
    ],
  },
];

export default function Adoptions() {
  const [filters, setFilters] = useState<Record<string, string>>({
    species: "", sex: "", ageCategory: "", size: "", vaccinated: "", sterilized: "", urgent: "",
  });
  const [search, setSearch] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  const params = new URLSearchParams({ status: "available" });
  Object.entries(filters).forEach(([k, v]) => { if (v) params.set(k, v); });

  const { data: pets = [], isLoading } = useQuery<Pet[]>({
    queryKey: ["/api/pets", filters],
    queryFn: async () => {
      const res = await fetch(`/api/pets?${params.toString()}`);
      if (!res.ok) throw new Error("Error cargando mascotas");
      return res.json();
    },
  });

  const setFilter = (key: string, value: string) =>
    setFilters(prev => ({ ...prev, [key]: prev[key] === value ? "" : value }));

  const filtered = pets.filter(p =>
    !search ||
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.breed || "").toLowerCase().includes(search.toLowerCase()) ||
    p.description.toLowerCase().includes(search.toLowerCase())
  );

  const urgentCount = pets.filter(p => p.urgent).length;

  return (
    <div className="max-w-7xl mx-auto px-4 py-10 sm:py-16">
      {/* Header */}
      <div className="mb-10">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-3 bg-amber-100 rounded-2xl">
            <Dog className="w-7 h-7 text-amber-600" />
          </div>
          <span className="bg-amber-100 text-amber-700 text-sm font-bold px-3 py-1 rounded-full uppercase tracking-wider">Bienestar Animal</span>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-end gap-4 justify-between">
          <div>
            <h1 className="text-4xl sm:text-5xl font-display font-black text-foreground mb-3">Adopta, no compres</h1>
            <p className="text-muted-foreground text-lg max-w-2xl">
              Cada mascota aquí tiene una historia y merece una familia. Todos han sido rescatados, atendidos y están listos para darte todo su amor.
            </p>
          </div>
          <div className="flex gap-3 shrink-0">
            <Link href="/publicar-mascota">
              <Button variant="outline" className="rounded-2xl border-amber-200 text-amber-700 hover:bg-amber-50">
                <Plus className="w-4 h-4 mr-2" /> Publicar mascota
              </Button>
            </Link>
            <Link href="/ayuda-animal">
              <Button className="rounded-2xl bg-amber-500 hover:bg-amber-600">
                <Heart className="w-4 h-4 mr-2" /> Ayuda Animal
              </Button>
            </Link>
          </div>
        </div>
        {urgentCount > 0 && (
          <div className="mt-6 bg-red-50 border border-red-200 rounded-2xl p-4 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 animate-pulse" />
            <p className="text-red-700 font-semibold">
              {urgentCount} mascota{urgentCount > 1 ? "s" : ""} marcada{urgentCount > 1 ? "s" : ""} como urgente{urgentCount > 1 ? "s" : ""} — necesitan hogar cuanto antes.
            </p>
          </div>
        )}
      </div>

      {/* Filters bar */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar por nombre o raza..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10 rounded-xl bg-secondary/30" />
        </div>
        <Button
          variant="outline"
          className={`rounded-xl gap-2 ${showFilters ? "bg-secondary" : ""}`}
          onClick={() => setShowFilters(!showFilters)}
        >
          <SlidersHorizontal className="w-4 h-4" /> Filtros
          {Object.values(filters).some(v => v) && (
            <span className="w-2 h-2 rounded-full bg-primary" />
          )}
        </Button>
        {/* Quick filters */}
        <div className="flex gap-2">
          {[
            { key: "urgent", value: "true", label: "⚡ Urgentes" },
            { key: "vaccinated", value: "true", label: "💉 Vacunados" },
            { key: "sterilized", value: "true", label: "✂️ Esterilizados" },
          ].map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key, f.value)}
              className={`px-3 py-2 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap ${
                filters[f.key] === f.value ? "bg-primary text-white" : "bg-secondary text-muted-foreground hover:bg-secondary/80"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Extended filters */}
      {showFilters && (
        <div className="bg-card border border-border rounded-3xl p-6 mb-6 grid grid-cols-2 sm:grid-cols-4 gap-6">
          {FILTER_GROUPS.map(group => (
            <div key={group.key}>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">{group.label}</p>
              <div className="space-y-1">
                {group.options.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setFilter(group.key, opt.value)}
                    className={`w-full text-left px-3 py-1.5 rounded-lg text-sm transition-colors ${
                      filters[group.key] === opt.value
                        ? "bg-primary/10 text-primary font-semibold"
                        : "text-foreground hover:bg-secondary"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Count */}
      <p className="text-sm text-muted-foreground mb-6">
        {isLoading ? "Cargando..." : `${filtered.length} mascota${filtered.length !== 1 ? "s" : ""} disponible${filtered.length !== 1 ? "s" : ""}`}
      </p>

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="bg-card rounded-3xl border border-border overflow-hidden animate-pulse">
              <div className="aspect-[4/3] bg-secondary" />
              <div className="p-5 space-y-3">
                <div className="h-5 bg-secondary rounded w-1/2" />
                <div className="h-4 bg-secondary rounded" />
                <div className="h-8 bg-secondary rounded-xl mt-4" />
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 space-y-4">
          <div className="w-20 h-20 bg-amber-50 rounded-full flex items-center justify-center mx-auto">
            <Dog className="w-10 h-10 text-amber-300" />
          </div>
          <h3 className="text-xl font-bold">No hay mascotas con esos filtros</h3>
          <p className="text-muted-foreground">Prueba con otros criterios o conoce cómo ayudar de otra forma.</p>
          <div className="flex gap-3 justify-center mt-2">
            <Button variant="outline" className="rounded-xl" onClick={() => setFilters({ species: "", sex: "", ageCategory: "", size: "", vaccinated: "", sterilized: "", urgent: "" })}>
              Limpiar filtros
            </Button>
            <Link href="/ayuda-animal">
              <Button className="rounded-xl bg-amber-500 hover:bg-amber-600">Ver ayuda animal</Button>
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filtered.map(pet => <PetCard key={pet.id} pet={pet} />)}
        </div>
      )}

      {/* Bottom CTA */}
      <div className="mt-16 bg-amber-50 border border-amber-200 rounded-3xl p-8 text-center">
        <Dog className="w-12 h-12 text-amber-400 mx-auto mb-4" />
        <h3 className="font-display font-bold text-2xl mb-2">¿Tienes una mascota que necesita un hogar?</h3>
        <p className="text-muted-foreground mb-5">Publica su ficha en nuestra red y encontraremos una familia responsable para ella.</p>
        <Link href="/publicar-mascota">
          <Button className="rounded-2xl px-8 h-12 bg-amber-500 hover:bg-amber-600 shadow-md hover-elevate">
            <Plus className="w-4 h-4 mr-2" /> Publicar para adopción
          </Button>
        </Link>
      </div>
    </div>
  );
}

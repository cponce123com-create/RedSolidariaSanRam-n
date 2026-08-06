import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import {
  Building2, Plus, Star, Globe, Trash2, Edit2,
  Check, X, Eye, EyeOff
} from "lucide-react";

interface Ally {
  id: number; name: string; type: string; logo: string | null;
  description: string | null; website: string | null;
  contactName: string | null; contactEmail: string | null; contactPhone: string | null;
  active: boolean; featured: boolean; sortOrder: number; createdAt: string;
}

const allySchema = z.object({
  name: z.string().min(2),
  type: z.string().min(1),
  logo: z.string().optional(),
  description: z.string().optional(),
  website: z.string().optional(),
  contactName: z.string().optional(),
  contactEmail: z.string().optional(),
  contactPhone: z.string().optional(),
  active: z.boolean().default(true),
  featured: z.boolean().default(false),
  sortOrder: z.number().default(0),
});

type AllyFormValues = z.infer<typeof allySchema>;

const TYPE_OPTIONS = [
  { value: "empresa", label: "Empresa" },
  { value: "emprendimiento", label: "Emprendimiento Local" },
  { value: "institucion", label: "Institución / Municipalidad" },
  { value: "ong", label: "ONG / Asociación" },
  { value: "persona", label: "Persona Solidaria" },
];

const TYPE_COLORS: Record<string, string> = {
  empresa: "bg-blue-100 text-blue-700",
  emprendimiento: "bg-green-100 text-green-700",
  institucion: "bg-purple-100 text-purple-700",
  persona: "bg-rose-100 text-rose-700",
  ong: "bg-amber-100 text-amber-700",
};

function AllyForm({ ally, onSave, onCancel }: { ally?: Ally; onSave: () => void; onCancel: () => void }) {
  const { toast } = useToast();
  const form = useForm<AllyFormValues>({
    resolver: zodResolver(allySchema),
    defaultValues: {
      name: ally?.name || "",
      type: ally?.type || "empresa",
      logo: ally?.logo || "",
      description: ally?.description || "",
      website: ally?.website || "",
      contactName: ally?.contactName || "",
      contactEmail: ally?.contactEmail || "",
      contactPhone: ally?.contactPhone || "",
      active: ally?.active ?? true,
      featured: ally?.featured ?? false,
      sortOrder: ally?.sortOrder ?? 0,
    },
  });

  const save = useMutation({
    mutationFn: async (values: AllyFormValues) => {
      const url = ally ? `/api/admin/allies/${ally.id}` : "/api/admin/allies";
      const method = ally ? "PATCH" : "POST";
      const res = await fetch(url, {
        method, credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (!res.ok) throw new Error("Error");
      return res.json();
    },
    onSuccess: () => { toast({ title: ally ? "Aliado actualizado" : "Aliado creado" }); onSave(); },
    onError: () => toast({ title: "Error al guardar", variant: "destructive" }),
  });

  const BOOL_TOGGLE = (label: string, key: keyof AllyFormValues) => (
    <div className="flex items-center justify-between bg-secondary/40 rounded-xl p-3">
      <p className="text-sm font-medium">{label}</p>
      <button type="button" onClick={() => form.setValue(key, !form.watch(key) as any)}
        className={`relative w-10 h-5 rounded-full transition-colors ${form.watch(key) ? "bg-primary" : "bg-border"}`}>
        <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${form.watch(key) ? "translate-x-5" : "translate-x-0.5"}`} />
      </button>
    </div>
  );

  return (
    <div className="bg-card border border-border rounded-2xl p-5 shadow-sm">
      <h3 className="font-bold text-base mb-4">{ally ? "Editar aliado" : "Nuevo aliado"}</h3>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(v => save.mutate(v))} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <FormField control={form.control} name="name" render={({ field }) => (
              <FormItem>
                <FormLabel>Nombre *</FormLabel>
                <FormControl><Input className="rounded-xl bg-secondary/30" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="type" render={({ field }) => (
              <FormItem>
                <FormLabel>Tipo</FormLabel>
                <select {...field} className="w-full h-10 px-3 rounded-xl border border-input bg-secondary/30 text-sm">
                  {TYPE_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </FormItem>
            )} />
          </div>
          <FormField control={form.control} name="description" render={({ field }) => (
            <FormItem>
              <FormLabel>Descripción corta</FormLabel>
              <FormControl><Textarea className="min-h-[60px] rounded-xl bg-secondary/30 resize-none text-sm" {...field} /></FormControl>
            </FormItem>
          )} />
          <div className="grid grid-cols-2 gap-4">
            <FormField control={form.control} name="logo" render={({ field }) => (
              <FormItem>
                <FormLabel>URL del logo</FormLabel>
                <FormControl><Input placeholder="https://..." className="rounded-xl bg-secondary/30" {...field} /></FormControl>
              </FormItem>
            )} />
            <FormField control={form.control} name="website" render={({ field }) => (
              <FormItem>
                <FormLabel>Sitio web</FormLabel>
                <FormControl><Input placeholder="https://..." className="rounded-xl bg-secondary/30" {...field} /></FormControl>
              </FormItem>
            )} />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <FormField control={form.control} name="contactName" render={({ field }) => (
              <FormItem>
                <FormLabel>Contacto</FormLabel>
                <FormControl><Input className="rounded-xl bg-secondary/30" {...field} /></FormControl>
              </FormItem>
            )} />
            <FormField control={form.control} name="contactEmail" render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl><Input className="rounded-xl bg-secondary/30" {...field} /></FormControl>
              </FormItem>
            )} />
            <FormField control={form.control} name="contactPhone" render={({ field }) => (
              <FormItem>
                <FormLabel>Teléfono</FormLabel>
                <FormControl><Input className="rounded-xl bg-secondary/30" {...field} /></FormControl>
              </FormItem>
            )} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            {BOOL_TOGGLE("Activo (visible en web)", "active")}
            {BOOL_TOGGLE("Destacado (aparece primero)", "featured")}
          </div>
          <div className="flex gap-3">
            <Button type="submit" className="rounded-xl" disabled={save.isPending}>
              <Check className="w-4 h-4 mr-1" /> {save.isPending ? "Guardando..." : "Guardar"}
            </Button>
            <Button type="button" variant="outline" className="rounded-xl" onClick={onCancel}>
              Cancelar
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}

export default function AdminAllies() {
  const [showForm, setShowForm] = useState(false);
  const [editingAlly, setEditingAlly] = useState<Ally | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: allies = [], isLoading } = useQuery<Ally[]>({
    queryKey: ["/api/admin/allies"],
    queryFn: async () => {
      const res = await fetch("/api/admin/allies", { credentials: "include" });
      if (!res.ok) throw new Error("Error");
      return res.json();
    },
  });

  const deleteAlly = useMutation({
    mutationFn: async (id: number) => {
      await fetch(`/api/admin/allies/${id}`, { method: "DELETE", credentials: "include" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/allies"] });
      toast({ title: "Aliado eliminado" });
    },
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, active }: { id: number; active: boolean }) => {
      const res = await fetch(`/api/admin/allies/${id}`, {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active }),
      });
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/allies"] }),
  });

  const handleSave = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/admin/allies"] });
    setShowForm(false);
    setEditingAlly(null);
  };

  return (
    <div className="p-6 sm:p-8 max-w-4xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-display font-black">Aliados</h1>
          <p className="text-muted-foreground mt-1">Empresas, instituciones y personas que apoyan la red</p>
        </div>
        <Button onClick={() => { setShowForm(true); setEditingAlly(null); }} className="rounded-xl gap-2">
          <Plus className="w-4 h-4" /> Nuevo aliado
        </Button>
      </div>

      {(showForm && !editingAlly) && (
        <div className="mb-6">
          <AllyForm onSave={handleSave} onCancel={() => setShowForm(false)} />
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <div key={i} className="bg-card border border-border rounded-2xl h-24 animate-pulse" />)}
        </div>
      ) : allies.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground bg-secondary/20 rounded-2xl">
          <Building2 className="w-12 h-12 mx-auto mb-3 opacity-20" />
          <p className="font-medium">No hay aliados registrados aún.</p>
          <p className="text-sm mt-1">Haz clic en "Nuevo aliado" para empezar.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {allies.map(ally => (
            <div key={ally.id}>
              {editingAlly?.id === ally.id ? (
                <AllyForm ally={ally} onSave={handleSave} onCancel={() => setEditingAlly(null)} />
              ) : (
                <div className="bg-card border border-border rounded-2xl p-4 flex items-start gap-4">
                  <div className="w-14 h-14 rounded-xl bg-secondary flex items-center justify-center overflow-hidden shrink-0">
                    {ally.logo ? (
                      <img src={ally.logo} alt={ally.name} className="w-full h-full object-contain p-1" />
                    ) : (
                      <Building2 className="w-7 h-7 text-muted-foreground opacity-30" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-bold">{ally.name}</h3>
                          {ally.featured && <Star className="w-4 h-4 text-primary fill-primary" />}
                          {!ally.active && <span className="text-xs bg-secondary text-muted-foreground px-2 py-0.5 rounded-full">Oculto</span>}
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${TYPE_COLORS[ally.type] || "bg-secondary"}`}>
                            {TYPE_OPTIONS.find(t => t.value === ally.type)?.label || ally.type}
                          </span>
                        </div>
                        {ally.description && <p className="text-sm text-muted-foreground mt-0.5 line-clamp-1">{ally.description}</p>}
                        <div className="flex gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                          {ally.website && <a href={ally.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-primary hover:underline"><Globe className="w-3 h-3" />{ally.website}</a>}
                          {ally.contactName && <span>{ally.contactName}</span>}
                          {ally.contactPhone && <span>{ally.contactPhone}</span>}
                        </div>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <Button size="sm" variant="outline" className="rounded-lg h-8 w-8 p-0"
                          onClick={() => toggleActive.mutate({ id: ally.id, active: !ally.active })}
                          title={ally.active ? "Ocultar" : "Mostrar"}
                          aria-label={ally.active ? `Ocultar ${ally.name}` : `Mostrar ${ally.name}`}>
                          {ally.active ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                        </Button>
                        <Button size="sm" variant="outline" className="rounded-lg h-8 w-8 p-0"
                          onClick={() => setEditingAlly(ally)} aria-label={`Editar ${ally.name}`}>
                          <Edit2 className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" className="rounded-lg h-8 w-8 p-0 text-destructive hover:bg-destructive/10"
                          onClick={() => { if (confirm(`¿Eliminar aliado "${ally.name}"?`)) deleteAlly.mutate(ally.id); }} aria-label={`Eliminar ${ally.name}`}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

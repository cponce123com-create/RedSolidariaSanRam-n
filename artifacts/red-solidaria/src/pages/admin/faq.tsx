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
import { Plus, Edit2, Trash2, Check, HelpCircle, Eye, EyeOff } from "lucide-react";

interface FaqItem {
  id: number; question: string; answer: string; category: string;
  sortOrder: number; active: boolean; createdAt: string;
}

const FAQ_CATEGORIES = [
  { value: "general", label: "General" },
  { value: "donaciones", label: "Donaciones" },
  { value: "voluntariado", label: "Voluntariado" },
  { value: "adopciones", label: "Adopciones" },
  { value: "aliados", label: "Aliados" },
];

const schema = z.object({
  question: z.string().min(5, "Pregunta requerida"),
  answer: z.string().min(10, "Respuesta requerida"),
  category: z.string().min(1),
  sortOrder: z.number().default(0),
  active: z.boolean().default(true),
});

type FormValues = z.infer<typeof schema>;

function FaqForm({ item, onSave, onCancel }: { item?: FaqItem; onSave: () => void; onCancel: () => void }) {
  const { toast } = useToast();
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      question: item?.question || "",
      answer: item?.answer || "",
      category: item?.category || "general",
      sortOrder: item?.sortOrder ?? 0,
      active: item?.active ?? true,
    },
  });

  const save = useMutation({
    mutationFn: async (values: FormValues) => {
      const url = item ? `/api/admin/faq/${item.id}` : "/api/admin/faq";
      const method = item ? "PATCH" : "POST";
      const res = await fetch(url, { method, credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) });
      if (!res.ok) throw new Error("Error");
    },
    onSuccess: () => { toast({ title: item ? "FAQ actualizada" : "Pregunta creada" }); onSave(); },
    onError: () => toast({ title: "Error al guardar", variant: "destructive" }),
  });

  return (
    <div className="bg-card border border-border rounded-2xl p-5">
      <h3 className="font-bold mb-4">{item ? "Editar pregunta" : "Nueva pregunta"}</h3>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(v => save.mutate(v))} className="space-y-4">
          <FormField control={form.control} name="question" render={({ field }) => (
            <FormItem><FormLabel>Pregunta *</FormLabel><FormControl><Input className="rounded-xl bg-secondary/30" {...field} /></FormControl><FormMessage /></FormItem>
          )} />
          <FormField control={form.control} name="answer" render={({ field }) => (
            <FormItem><FormLabel>Respuesta *</FormLabel><FormControl><Textarea className="rounded-xl bg-secondary/30 min-h-[100px] resize-none" {...field} /></FormControl><FormMessage /></FormItem>
          )} />
          <div className="grid grid-cols-2 gap-4">
            <FormField control={form.control} name="category" render={({ field }) => (
              <FormItem><FormLabel>Categoría</FormLabel>
                <select {...field} className="w-full h-10 px-3 rounded-xl border border-input bg-secondary/30 text-sm">
                  {FAQ_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </FormItem>
            )} />
            <FormField control={form.control} name="sortOrder" render={({ field }) => (
              <FormItem><FormLabel>Orden</FormLabel>
                <FormControl><Input type="number" className="rounded-xl bg-secondary/30" {...field} onChange={e => field.onChange(Number(e.target.value))} /></FormControl>
              </FormItem>
            )} />
          </div>
          <div className="flex items-center justify-between bg-secondary/40 rounded-xl p-3">
            <p className="text-sm font-medium">Activa (visible en web)</p>
            <button type="button" onClick={() => form.setValue("active", !form.watch("active"))}
              className={`relative w-10 h-5 rounded-full transition-colors ${form.watch("active") ? "bg-primary" : "bg-border"}`}>
              <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${form.watch("active") ? "translate-x-5" : "translate-x-0.5"}`} />
            </button>
          </div>
          <div className="flex gap-3">
            <Button type="submit" disabled={save.isPending} className="rounded-xl"><Check className="w-4 h-4 mr-1" />{save.isPending ? "Guardando..." : "Guardar"}</Button>
            <Button type="button" variant="outline" className="rounded-xl" onClick={onCancel}>Cancelar</Button>
          </div>
        </form>
      </Form>
    </div>
  );
}

export default function AdminFaq() {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<FaqItem | null>(null);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: faqs = [], isLoading } = useQuery<FaqItem[]>({
    queryKey: ["/api/admin/faq"],
    queryFn: async () => { const r = await fetch("/api/admin/faq", { credentials: "include" }); return r.json(); },
  });

  const deleteItem = useMutation({
    mutationFn: async (id: number) => { await fetch(`/api/admin/faq/${id}`, { method: "DELETE", credentials: "include" }); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/admin/faq"] }); toast({ title: "Pregunta eliminada" }); },
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, active }: { id: number; active: boolean }) => {
      await fetch(`/api/admin/faq/${id}`, { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active }) });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/faq"] }),
  });

  const handleSave = () => { queryClient.invalidateQueries({ queryKey: ["/api/admin/faq"] }); setShowForm(false); setEditing(null); };

  const filtered = faqs.filter(f => categoryFilter === "all" || f.category === categoryFilter);
  const CATEGORY_COLOR: Record<string, string> = {
    general: "bg-gray-100 text-gray-700", donaciones: "bg-red-100 text-red-700",
    voluntariado: "bg-green-100 text-green-700", adopciones: "bg-amber-100 text-amber-700", aliados: "bg-purple-100 text-purple-700",
  };

  return (
    <div className="p-6 sm:p-8 max-w-4xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-display font-black">Preguntas Frecuentes</h1>
          <p className="text-muted-foreground mt-1">Gestión del contenido FAQ visible en el sitio</p>
        </div>
        <Button onClick={() => { setShowForm(true); setEditing(null); }} className="rounded-xl gap-2">
          <Plus className="w-4 h-4" /> Nueva pregunta
        </Button>
      </div>

      {(showForm && !editing) && (
        <div className="mb-6"><FaqForm onSave={handleSave} onCancel={() => setShowForm(false)} /></div>
      )}

      <div className="flex gap-2 flex-wrap mb-5">
        {[{ value: "all", label: "Todas" }, ...FAQ_CATEGORIES].map(cat => (
          <button key={cat.value} onClick={() => setCategoryFilter(cat.value)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${categoryFilter === cat.value ? "bg-primary text-white shadow-sm" : "bg-secondary text-muted-foreground hover:bg-secondary/80"}`}>
            {cat.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-3">{[...Array(4)].map((_, i) => <div key={i} className="bg-card border border-border rounded-2xl h-24 animate-pulse" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground bg-secondary/20 rounded-2xl">
          <HelpCircle className="w-12 h-12 mx-auto mb-3 opacity-20" />
          <p className="font-medium">No hay preguntas en esta categoría.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(f => (
            <div key={f.id}>
              {editing?.id === f.id ? (
                <FaqForm item={f} onSave={handleSave} onCancel={() => setEditing(null)} />
              ) : (
                <div className={`bg-card border rounded-2xl p-5 ${!f.active ? "opacity-60 border-dashed" : "border-border"}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-2">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${CATEGORY_COLOR[f.category] || "bg-secondary"}`}>
                          {FAQ_CATEGORIES.find(c => c.value === f.category)?.label || f.category}
                        </span>
                        {!f.active && <span className="text-xs text-muted-foreground">(Oculta)</span>}
                        <span className="text-xs text-muted-foreground">Orden: {f.sortOrder}</span>
                      </div>
                      <p className="font-bold mb-1">{f.question}</p>
                      <p className="text-sm text-muted-foreground leading-relaxed">{f.answer}</p>
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      <Button size="sm" variant="outline" className="rounded-lg h-8 w-8 p-0"
                        onClick={() => toggleActive.mutate({ id: f.id, active: !f.active })}
                        title={f.active ? "Ocultar" : "Mostrar"}
                        aria-label={f.active ? `Ocultar pregunta ${f.question}` : `Mostrar pregunta ${f.question}`}>
                        {f.active ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                      </Button>
                      <Button size="sm" variant="outline" className="rounded-lg h-8 w-8 p-0" onClick={() => setEditing(f)} aria-label={`Editar pregunta ${f.question}`}>
                        <Edit2 className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" className="rounded-lg h-8 w-8 p-0 text-destructive hover:bg-destructive/10"
                        onClick={() => { if (confirm("¿Eliminar esta pregunta?")) deleteItem.mutate(f.id); }} aria-label={`Eliminar pregunta ${f.question}`}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
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

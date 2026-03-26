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
import { Plus, Edit2, Trash2, Check, Quote, User } from "lucide-react";

interface Testimonial {
  id: number; name: string; role: string; message: string;
  avatarUrl: string | null; createdAt: string;
}

const schema = z.object({
  name: z.string().min(2, "Nombre requerido"),
  role: z.string().min(2, "Rol/descripción requerido"),
  message: z.string().min(10, "Testimonio requerido"),
  avatarUrl: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

function TestimonialForm({ item, onSave, onCancel }: { item?: Testimonial; onSave: () => void; onCancel: () => void }) {
  const { toast } = useToast();
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: item?.name || "", role: item?.role || "", message: item?.message || "", avatarUrl: item?.avatarUrl || "" },
  });

  const save = useMutation({
    mutationFn: async (values: FormValues) => {
      const url = item ? `/api/testimonials/${item.id}` : "/api/testimonials";
      const method = item ? "PUT" : "POST";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) });
      if (!res.ok) throw new Error("Error");
    },
    onSuccess: () => { toast({ title: item ? "Testimonio actualizado" : "Testimonio creado" }); onSave(); },
    onError: () => toast({ title: "Error al guardar", variant: "destructive" }),
  });

  return (
    <div className="bg-card border border-border rounded-2xl p-5">
      <h3 className="font-bold mb-4">{item ? "Editar testimonio" : "Nuevo testimonio"}</h3>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(v => save.mutate(v))} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <FormField control={form.control} name="name" render={({ field }) => (
              <FormItem><FormLabel>Nombre *</FormLabel><FormControl><Input className="rounded-xl bg-secondary/30" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="role" render={({ field }) => (
              <FormItem><FormLabel>Descripción / rol *</FormLabel><FormControl><Input placeholder="Ej. Madre de familia, San Ramón" className="rounded-xl bg-secondary/30" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
          </div>
          <FormField control={form.control} name="message" render={({ field }) => (
            <FormItem><FormLabel>Testimonio *</FormLabel><FormControl><Textarea className="rounded-xl bg-secondary/30 min-h-[100px] resize-none" {...field} /></FormControl><FormMessage /></FormItem>
          )} />
          <FormField control={form.control} name="avatarUrl" render={({ field }) => (
            <FormItem><FormLabel>URL de foto (opcional)</FormLabel><FormControl><Input placeholder="https://..." className="rounded-xl bg-secondary/30" {...field} /></FormControl></FormItem>
          )} />
          <div className="flex gap-3">
            <Button type="submit" disabled={save.isPending} className="rounded-xl"><Check className="w-4 h-4 mr-1" />{save.isPending ? "Guardando..." : "Guardar"}</Button>
            <Button type="button" variant="outline" className="rounded-xl" onClick={onCancel}>Cancelar</Button>
          </div>
        </form>
      </Form>
    </div>
  );
}

export default function AdminTestimonials() {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Testimonial | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: testimonials = [], isLoading } = useQuery<Testimonial[]>({
    queryKey: ["/api/testimonials"],
    queryFn: async () => { const r = await fetch("/api/testimonials"); return r.json(); },
  });

  const deleteItem = useMutation({
    mutationFn: async (id: number) => { await fetch(`/api/testimonials/${id}`, { method: "DELETE" }); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/testimonials"] }); toast({ title: "Testimonio eliminado" }); },
  });

  const handleSave = () => { queryClient.invalidateQueries({ queryKey: ["/api/testimonials"] }); setShowForm(false); setEditing(null); };

  return (
    <div className="p-6 sm:p-8 max-w-4xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-display font-black">Testimonios</h1>
          <p className="text-muted-foreground mt-1">Historias y palabras de quienes han recibido apoyo</p>
        </div>
        <Button onClick={() => { setShowForm(true); setEditing(null); }} className="rounded-xl gap-2">
          <Plus className="w-4 h-4" /> Nuevo testimonio
        </Button>
      </div>

      {(showForm && !editing) && (
        <div className="mb-6"><TestimonialForm onSave={handleSave} onCancel={() => setShowForm(false)} /></div>
      )}

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{[...Array(4)].map((_, i) => <div key={i} className="bg-card border border-border rounded-2xl h-36 animate-pulse" />)}</div>
      ) : testimonials.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground bg-secondary/20 rounded-2xl">
          <Quote className="w-12 h-12 mx-auto mb-3 opacity-20" />
          <p className="font-medium">No hay testimonios aún.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {testimonials.map(t => (
            <div key={t.id}>
              {editing?.id === t.id ? (
                <TestimonialForm item={t} onSave={handleSave} onCancel={() => setEditing(null)} />
              ) : (
                <div className="bg-card border border-border rounded-2xl p-5 flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {t.avatarUrl ? (
                        <img src={t.avatarUrl} alt={t.name} className="w-10 h-10 rounded-full object-cover" />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                          <User className="w-5 h-5 text-primary" />
                        </div>
                      )}
                      <div>
                        <p className="font-bold text-sm">{t.name}</p>
                        <p className="text-xs text-muted-foreground">{t.role}</p>
                      </div>
                    </div>
                    <div className="flex gap-1.5">
                      <Button size="sm" variant="outline" className="rounded-lg h-7 w-7 p-0" onClick={() => setEditing(t)}>
                        <Edit2 className="w-3 h-3" />
                      </Button>
                      <Button size="sm" variant="ghost" className="rounded-lg h-7 w-7 p-0 text-destructive hover:bg-destructive/10"
                        onClick={() => { if (confirm(`¿Eliminar testimonio de "${t.name}"?`)) deleteItem.mutate(t.id); }}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                  <div className="border-t border-border pt-3">
                    <Quote className="w-4 h-4 text-primary opacity-50 mb-1" />
                    <p className="text-sm text-muted-foreground leading-relaxed line-clamp-3">{t.message}</p>
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

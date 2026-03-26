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
import { Plus, Edit2, Trash2, Check, Newspaper, Eye, EyeOff } from "lucide-react";

interface NewsItem {
  id: number; title: string; content: string; summary: string;
  imageUrl: string | null; publishedAt: string; createdAt: string;
}

const newsSchema = z.object({
  title: z.string().min(3, "Título requerido"),
  summary: z.string().min(5, "Resumen requerido"),
  content: z.string().min(10, "Contenido requerido"),
  imageUrl: z.string().optional(),
  publishedAt: z.string().min(1, "Fecha requerida"),
});

type NewsFormValues = z.infer<typeof newsSchema>;

function NewsForm({ item, onSave, onCancel }: { item?: NewsItem; onSave: () => void; onCancel: () => void }) {
  const { toast } = useToast();
  const today = new Date().toISOString().split("T")[0];
  const form = useForm<NewsFormValues>({
    resolver: zodResolver(newsSchema),
    defaultValues: {
      title: item?.title || "",
      summary: item?.summary || "",
      content: item?.content || "",
      imageUrl: item?.imageUrl || "",
      publishedAt: item?.publishedAt || today,
    },
  });

  const save = useMutation({
    mutationFn: async (values: NewsFormValues) => {
      const url = item ? `/api/news/${item.id}` : "/api/news";
      const method = item ? "PUT" : "POST";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) });
      if (!res.ok) throw new Error("Error");
    },
    onSuccess: () => { toast({ title: item ? "Noticia actualizada" : "Noticia publicada" }); onSave(); },
    onError: () => toast({ title: "Error al guardar", variant: "destructive" }),
  });

  return (
    <div className="bg-card border border-border rounded-2xl p-5">
      <h3 className="font-bold mb-4">{item ? "Editar noticia" : "Nueva noticia"}</h3>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(v => save.mutate(v))} className="space-y-4">
          <FormField control={form.control} name="title" render={({ field }) => (
            <FormItem><FormLabel>Título *</FormLabel><FormControl><Input className="rounded-xl bg-secondary/30" {...field} /></FormControl><FormMessage /></FormItem>
          )} />
          <FormField control={form.control} name="summary" render={({ field }) => (
            <FormItem><FormLabel>Resumen *</FormLabel><FormControl><Textarea className="rounded-xl bg-secondary/30 min-h-[70px] resize-none" {...field} /></FormControl><FormMessage /></FormItem>
          )} />
          <FormField control={form.control} name="content" render={({ field }) => (
            <FormItem><FormLabel>Contenido completo *</FormLabel><FormControl><Textarea className="rounded-xl bg-secondary/30 min-h-[140px] resize-none" {...field} /></FormControl><FormMessage /></FormItem>
          )} />
          <div className="grid grid-cols-2 gap-4">
            <FormField control={form.control} name="imageUrl" render={({ field }) => (
              <FormItem><FormLabel>URL imagen</FormLabel><FormControl><Input placeholder="https://..." className="rounded-xl bg-secondary/30" {...field} /></FormControl></FormItem>
            )} />
            <FormField control={form.control} name="publishedAt" render={({ field }) => (
              <FormItem><FormLabel>Fecha de publicación *</FormLabel><FormControl><Input type="date" className="rounded-xl bg-secondary/30" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
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

export default function AdminNews() {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<NewsItem | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: news = [], isLoading } = useQuery<NewsItem[]>({
    queryKey: ["/api/news"],
    queryFn: async () => { const r = await fetch("/api/news"); return r.json(); },
  });

  const deleteNews = useMutation({
    mutationFn: async (id: number) => { await fetch(`/api/news/${id}`, { method: "DELETE" }); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/news"] }); toast({ title: "Noticia eliminada" }); },
  });

  const handleSave = () => { queryClient.invalidateQueries({ queryKey: ["/api/news"] }); setShowForm(false); setEditing(null); };

  return (
    <div className="p-6 sm:p-8 max-w-4xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-display font-black">Noticias</h1>
          <p className="text-muted-foreground mt-1">Publicaciones del blog y novedades</p>
        </div>
        <Button onClick={() => { setShowForm(true); setEditing(null); }} className="rounded-xl gap-2">
          <Plus className="w-4 h-4" /> Nueva noticia
        </Button>
      </div>

      {(showForm && !editing) && (
        <div className="mb-6"><NewsForm onSave={handleSave} onCancel={() => setShowForm(false)} /></div>
      )}

      {isLoading ? (
        <div className="space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="bg-card border border-border rounded-2xl h-24 animate-pulse" />)}</div>
      ) : news.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground bg-secondary/20 rounded-2xl">
          <Newspaper className="w-12 h-12 mx-auto mb-3 opacity-20" />
          <p className="font-medium">No hay noticias publicadas.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {news.map(item => (
            <div key={item.id}>
              {editing?.id === item.id ? (
                <NewsForm item={item} onSave={handleSave} onCancel={() => setEditing(null)} />
              ) : (
                <div className="bg-card border border-border rounded-2xl p-5 flex gap-4">
                  {item.imageUrl && (
                    <img src={item.imageUrl} alt={item.title} className="w-20 h-16 object-cover rounded-xl shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="font-bold">{item.title}</h3>
                        <p className="text-sm text-muted-foreground line-clamp-1 mt-0.5">{item.summary}</p>
                        <p className="text-xs text-muted-foreground mt-1">{new Date(item.publishedAt).toLocaleDateString("es-PE")}</p>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <Button size="sm" variant="outline" className="rounded-lg h-8 w-8 p-0" onClick={() => setEditing(item)}>
                          <Edit2 className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" className="rounded-lg h-8 w-8 p-0 text-destructive hover:bg-destructive/10"
                          onClick={() => { if (confirm(`¿Eliminar "${item.title}"?`)) deleteNews.mutate(item.id); }}>
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

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useParams, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Dog, Cat, Save, Trash2 } from "lucide-react";

const schema = z.object({
  name: z.string().min(1),
  species: z.string().min(1),
  breed: z.string().optional(),
  sex: z.string().min(1),
  ageCategory: z.string().min(1),
  ageApprox: z.string().optional(),
  size: z.string().min(1),
  photos: z.string().optional(),
  description: z.string().min(10),
  history: z.string().optional(),
  healthStatus: z.string().default("good"),
  vaccinated: z.boolean().default(false),
  sterilized: z.boolean().default(false),
  dewormed: z.boolean().default(false),
  adoptionRequirements: z.string().optional(),
  location: z.string().min(2),
  contactName: z.string().min(2),
  contactPhone: z.string().optional(),
  contactEmail: z.string().optional(),
  urgent: z.boolean().default(false),
  status: z.string().default("available"),
});
type FormValues = z.infer<typeof schema>;

const BOOL_FIELD = (label: string, key: keyof FormValues, form: any) => (
  <div className="flex items-center justify-between bg-secondary/40 rounded-xl p-3">
    <p className="text-sm font-medium">{label}</p>
    <button type="button" onClick={() => form.setValue(key, !form.watch(key))}
      className={`relative w-12 h-7 rounded-full transition-colors ${form.watch(key) ? "bg-primary" : "bg-border"}`}>
      <span className={`absolute top-1 w-5 h-5 bg-card rounded-full shadow transition-transform ${form.watch(key) ? "translate-x-6" : "translate-x-1"}`} />
    </button>
  </div>
);

export default function AdminPetForm() {
  const { id } = useParams();
  const isEdit = !!id && id !== "nueva";
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: existingPet, isLoading } = useQuery({
    queryKey: ["/api/admin/pets", id],
    queryFn: async () => {
      const res = await fetch(`/api/admin/pets/${id}`, { credentials: "include" });
      return res.json();
    },
    enabled: isEdit,
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "", species: "perro", sex: "macho", ageCategory: "adult", size: "medium",
      healthStatus: "good", vaccinated: false, sterilized: false, dewormed: false,
      urgent: false, status: "available",
      breed: "", ageApprox: "", photos: "", description: "", history: "",
      location: "", contactName: "", contactPhone: "", contactEmail: "", adoptionRequirements: "",
    },
    values: isEdit && existingPet ? {
      ...existingPet,
      photos: Array.isArray(existingPet.photos) ? existingPet.photos.join(", ") : (existingPet.photos || ""),
    } : undefined,
  });

  const save = useMutation({
    mutationFn: async (values: FormValues) => {
      const body = { ...values, photos: values.photos ? values.photos.split(",").map(s => s.trim()).filter(Boolean) : [] };
      const url = isEdit ? `/api/admin/pets/${id}` : "/api/admin/pets";
      const method = isEdit ? "PATCH" : "POST";
      const res = await fetch(url, {
        method, credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Error al guardar");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pets"] });
      toast({ title: isEdit ? "Mascota actualizada" : "Mascota creada" });
      setLocation("/admin/adopciones");
    },
    onError: () => toast({ title: "Error al guardar", variant: "destructive" }),
  });

  if (isLoading) return <div className="p-8 animate-pulse"><div className="h-8 bg-secondary rounded w-48 mb-8" /></div>;

  return (
    <div className="p-6 sm:p-8 max-w-3xl">
      <div className="mb-8">
        <Link href="/admin/adopciones">
          <button className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors">
            <ArrowLeft className="w-4 h-4" /> Volver a adopciones
          </button>
        </Link>
        <h1 className="text-3xl font-display font-black">{isEdit ? "Editar mascota" : "Nueva mascota"}</h1>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(v => save.mutate(v))} className="space-y-6">
          <div className="bg-card border border-border rounded-3xl p-6 space-y-5">
            <h2 className="font-bold text-lg">Información básica</h2>
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="species" render={({ field }) => (
                <FormItem>
                  <FormLabel>Especie</FormLabel>
                  <div className="flex gap-2 mt-1">
                    {[{ v: "perro", l: "Perro", I: Dog }, { v: "gato", l: "Gato", I: Cat }].map(s => (
                      <button key={s.v} type="button" onClick={() => field.onChange(s.v)}
                        className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-sm border-2 font-medium ${field.value === s.v ? "border-primary bg-primary/10 text-primary" : "border-border bg-secondary/30 text-muted-foreground"}`}>
                        <s.I className="w-4 h-4" />{s.l}
                      </button>
                    ))}
                  </div>
                </FormItem>
              )} />
              <FormField control={form.control} name="name" render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre</FormLabel>
                  <FormControl><Input className="rounded-xl bg-secondary/30" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="breed" render={({ field }) => (
                <FormItem>
                  <FormLabel>Raza</FormLabel>
                  <FormControl><Input placeholder="Mestizo..." className="rounded-xl bg-secondary/30" {...field} /></FormControl>
                </FormItem>
              )} />
              <FormField control={form.control} name="sex" render={({ field }) => (
                <FormItem>
                  <FormLabel>Sexo</FormLabel>
                  <div className="flex gap-2 mt-1">
                    {[{ v: "macho", l: "Macho" }, { v: "hembra", l: "Hembra" }].map(s => (
                      <button key={s.v} type="button" onClick={() => field.onChange(s.v)}
                        className={`flex-1 py-2 rounded-xl text-sm border-2 font-medium ${field.value === s.v ? "border-primary bg-primary/10 text-primary" : "border-border bg-secondary/30 text-muted-foreground"}`}>
                        {s.l}
                      </button>
                    ))}
                  </div>
                </FormItem>
              )} />
              <FormField control={form.control} name="ageCategory" render={({ field }) => (
                <FormItem>
                  <FormLabel>Etapa</FormLabel>
                  <select {...field} className="w-full h-10 px-3 rounded-xl border border-input bg-secondary/30 text-sm">
                    <option value="puppy">Cachorro</option>
                    <option value="adult">Adulto</option>
                    <option value="senior">Adulto mayor</option>
                  </select>
                </FormItem>
              )} />
              <FormField control={form.control} name="size" render={({ field }) => (
                <FormItem>
                  <FormLabel>Tamaño</FormLabel>
                  <select {...field} className="w-full h-10 px-3 rounded-xl border border-input bg-secondary/30 text-sm">
                    <option value="small">Pequeño</option>
                    <option value="medium">Mediano</option>
                    <option value="large">Grande</option>
                    <option value="giant">Gigante</option>
                  </select>
                </FormItem>
              )} />
              <FormField control={form.control} name="ageApprox" render={({ field }) => (
                <FormItem>
                  <FormLabel>Edad aproximada</FormLabel>
                  <FormControl><Input placeholder="2 años, 6 meses..." className="rounded-xl bg-secondary/30" {...field} /></FormControl>
                </FormItem>
              )} />
              <FormField control={form.control} name="status" render={({ field }) => (
                <FormItem>
                  <FormLabel>Estado</FormLabel>
                  <select {...field} className="w-full h-10 px-3 rounded-xl border border-input bg-secondary/30 text-sm">
                    <option value="reviewing">En revisión</option>
                    <option value="available">Disponible</option>
                    <option value="in-process">En proceso</option>
                    <option value="adopted">Adoptado</option>
                  </select>
                </FormItem>
              )} />
            </div>
            <FormField control={form.control} name="photos" render={({ field }) => (
              <FormItem>
                <FormLabel>URLs de fotos (separadas por coma)</FormLabel>
                <FormControl><Input placeholder="https://..." className="rounded-xl bg-secondary/30" {...field} /></FormControl>
              </FormItem>
            )} />
          </div>

          <div className="bg-card border border-border rounded-3xl p-6 space-y-4">
            <h2 className="font-bold text-lg">Descripción</h2>
            <FormField control={form.control} name="description" render={({ field }) => (
              <FormItem>
                <FormLabel>Descripción</FormLabel>
                <FormControl><Textarea className="min-h-[100px] rounded-xl bg-secondary/30 resize-none" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="history" render={({ field }) => (
              <FormItem>
                <FormLabel>Historia (opcional)</FormLabel>
                <FormControl><Textarea className="min-h-[80px] rounded-xl bg-secondary/30 resize-none" {...field} /></FormControl>
              </FormItem>
            )} />
            <FormField control={form.control} name="adoptionRequirements" render={({ field }) => (
              <FormItem>
                <FormLabel>Requisitos de adopción</FormLabel>
                <FormControl><Textarea className="min-h-[60px] rounded-xl bg-secondary/30 resize-none" {...field} /></FormControl>
              </FormItem>
            )} />
          </div>

          <div className="bg-card border border-border rounded-3xl p-6 space-y-3">
            <h2 className="font-bold text-lg">Salud</h2>
            <FormField control={form.control} name="healthStatus" render={({ field }) => (
              <FormItem>
                <FormLabel>Estado de salud</FormLabel>
                <select {...field} className="w-full h-10 px-3 rounded-xl border border-input bg-secondary/30 text-sm">
                  <option value="excellent">Excelente</option>
                  <option value="good">Bueno</option>
                  <option value="fair">Regular</option>
                  <option value="needs_care">Necesita cuidados</option>
                </select>
              </FormItem>
            )} />
            {BOOL_FIELD("Vacunado/a", "vaccinated", form)}
            {BOOL_FIELD("Esterilizado/a", "sterilized", form)}
            {BOOL_FIELD("Desparasitado/a", "dewormed", form)}
            {BOOL_FIELD("¡URGENTE! Necesita hogar cuanto antes", "urgent", form)}
          </div>

          <div className="bg-card border border-border rounded-3xl p-6 space-y-4">
            <h2 className="font-bold text-lg">Contacto</h2>
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="location" render={({ field }) => (
                <FormItem className="col-span-2">
                  <FormLabel>Ubicación</FormLabel>
                  <FormControl><Input placeholder="San Ramón, Chanchamayo" className="rounded-xl bg-secondary/30" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="contactName" render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre de contacto</FormLabel>
                  <FormControl><Input className="rounded-xl bg-secondary/30" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="contactPhone" render={({ field }) => (
                <FormItem>
                  <FormLabel>Teléfono</FormLabel>
                  <FormControl><Input className="rounded-xl bg-secondary/30" {...field} /></FormControl>
                </FormItem>
              )} />
            </div>
          </div>

          <div className="flex gap-4">
            <Button type="submit" className="rounded-xl h-12 px-8" disabled={save.isPending}>
              <Save className="w-4 h-4 mr-2" /> {save.isPending ? "Guardando..." : isEdit ? "Guardar cambios" : "Crear mascota"}
            </Button>
            <Link href="/admin/adopciones">
              <Button type="button" variant="outline" className="rounded-xl h-12">Cancelar</Button>
            </Link>
          </div>
        </form>
      </Form>
    </div>
  );
}

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import {
  Dog, Cat, Heart, ArrowLeft, MapPin, Syringe, Scissors, Shield,
  Phone, Mail, User, Home, Check, ChevronLeft, ChevronRight, Star,
  AlertTriangle, Calendar, Ruler
} from "lucide-react";

interface Pet {
  id: number; name: string; species: string; breed: string | null;
  sex: string; ageCategory: string; ageApprox: string | null;
  size: string; photos: string[] | null; description: string;
  history: string | null; healthStatus: string; vaccinated: boolean;
  sterilized: boolean; dewormed: boolean; adoptionRequirements: string | null;
  urgent: boolean; status: string; location: string;
  contactName: string; contactPhone: string | null; contactEmail: string | null;
  createdAt: string;
}

const adoptSchema = z.object({
  requesterName: z.string().min(2, "Tu nombre es requerido"),
  requesterAge: z.string().min(1, "Tu edad es requerida"),
  requesterPhone: z.string().min(7, "Teléfono requerido"),
  requesterEmail: z.string().email("Email inválido").optional().or(z.literal("")),
  requesterAddress: z.string().min(5, "Dirección requerida"),
  hasPetExperience: z.boolean().default(false),
  previousPets: z.string().optional(),
  housingType: z.enum(["casa-propia", "casa-alquilada", "departamento", "cuarto"], {
    required_error: "Selecciona tu tipo de vivienda",
  }),
  hasYard: z.boolean().default(false),
  adoptionReason: z.string().min(20, "Cuéntanos más sobre tu motivación (mínimo 20 caracteres)"),
  acceptsFollowUp: z.boolean().default(true),
});

type AdoptFormValues = z.infer<typeof adoptSchema>;

const SIZE_LABELS: Record<string, string> = { small: "Pequeño", medium: "Mediano", large: "Grande", giant: "Gigante" };
const AGE_LABELS: Record<string, string> = { puppy: "Cachorro", adult: "Adulto", senior: "Adulto mayor" };
const HEALTH_LABELS: Record<string, { label: string; color: string }> = {
  excellent: { label: "Excelente", color: "text-green-700" },
  good: { label: "Bueno", color: "text-green-700" },
  fair: { label: "Regular", color: "text-yellow-700" },
  needs_care: { label: "Necesita cuidados", color: "text-orange-700" },
};
const HOUSING_TYPES = [
  { value: "casa-propia", label: "Casa propia" },
  { value: "casa-alquilada", label: "Casa alquilada" },
  { value: "departamento", label: "Departamento" },
  { value: "cuarto", label: "Cuarto / habitación" },
];

export default function PetDetail() {
  const { id } = useParams();
  const { toast } = useToast();
  const [photoIdx, setPhotoIdx] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const { data: pet, isLoading } = useQuery<Pet>({
    queryKey: ["/api/pets", id],
    queryFn: async () => {
      const res = await fetch(`/api/pets/${id}`);
      if (!res.ok) throw new Error("Mascota no encontrada");
      return res.json();
    },
  });

  const form = useForm<AdoptFormValues>({
    resolver: zodResolver(adoptSchema),
    defaultValues: {
      requesterName: "", requesterAge: "", requesterPhone: "",
      requesterEmail: "", requesterAddress: "",
      hasPetExperience: false, previousPets: "", hasYard: false,
      adoptionReason: "", acceptsFollowUp: true,
    },
  });

  const submitRequest = useMutation({
    mutationFn: async (values: AdoptFormValues) => {
      const res = await fetch(`/api/pets/${id}/adopt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Error al enviar solicitud");
      }
      return res.json();
    },
    onSuccess: () => { setSubmitted(true); setShowForm(false); },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  if (isLoading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-16 animate-pulse">
        <div className="h-8 bg-secondary rounded w-48 mb-8" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
          <div className="aspect-square bg-secondary rounded-3xl" />
          <div className="space-y-4">
            <div className="h-10 bg-secondary rounded w-3/4" />
            <div className="h-4 bg-secondary rounded" />
            <div className="h-4 bg-secondary rounded w-2/3" />
          </div>
        </div>
      </div>
    );
  }

  if (!pet) return (
    <div className="text-center py-20">
      <p className="text-muted-foreground">Mascota no encontrada.</p>
      <Link href="/adopciones"><Button className="mt-4 rounded-xl">Ver adopciones</Button></Link>
    </div>
  );

  const photos = pet.photos?.filter(Boolean) || [];
  const SpeciesIcon = pet.species === "gato" ? Cat : Dog;
  const healthInfo = HEALTH_LABELS[pet.healthStatus] || { label: pet.healthStatus, color: "text-foreground" };

  return (
    <div className="max-w-5xl mx-auto px-4 py-10 sm:py-16">
      {/* Back nav */}
      <Link href="/adopciones">
        <button className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-8 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Volver al catálogo
        </button>
      </Link>

      {/* Status banner */}
      {pet.status === "adopted" && (
        <div className="bg-green-50 border border-green-200 rounded-2xl p-4 mb-6 flex items-center gap-3">
          <Check className="w-5 h-5 text-green-600" />
          <p className="text-green-800 font-semibold">{pet.name} ya encontró familia. ¡Misión cumplida! 🎉</p>
        </div>
      )}
      {pet.status === "in-process" && (
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 mb-6 flex items-center gap-3">
          <Heart className="w-5 h-5 text-blue-600" />
          <p className="text-blue-800 font-semibold">{pet.name} está en proceso de adopción. Puedes enviar tu solicitud de todas formas.</p>
        </div>
      )}
      {pet.urgent && pet.status === "available" && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 mb-6 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-600 animate-pulse" />
          <p className="text-red-800 font-semibold">¡Urgente! {pet.name} necesita un hogar lo antes posible.</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
        {/* Photos */}
        <div>
          <div className="aspect-[4/3] bg-secondary rounded-3xl overflow-hidden relative shadow-lg">
            {photos.length > 0 ? (
              <>
                <img src={photos[photoIdx]} alt={pet.name} className="w-full h-full object-cover" />
                {photos.length > 1 && (
                  <>
                    <button onClick={() => setPhotoIdx(i => (i - 1 + photos.length) % photos.length)}
                      className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 bg-card/90 rounded-full flex items-center justify-center shadow-md hover:bg-card transition-colors">
                      <ChevronLeft className="w-5 h-5" />
                    </button>
                    <button onClick={() => setPhotoIdx(i => (i + 1) % photos.length)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 bg-card/90 rounded-full flex items-center justify-center shadow-md hover:bg-card transition-colors">
                      <ChevronRight className="w-5 h-5" />
                    </button>
                    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
                      {photos.map((_, i) => (
                        <button key={i} onClick={() => setPhotoIdx(i)}
                          className={`w-2 h-2 rounded-full transition-colors ${i === photoIdx ? "bg-card" : "bg-card/50"}`} />
                      ))}
                    </div>
                  </>
                )}
              </>
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-amber-50 to-orange-50">
                <SpeciesIcon className="w-32 h-32 text-amber-200" />
              </div>
            )}
            {pet.urgent && (
              <div className="absolute top-3 left-3 bg-red-500 text-white text-xs font-bold px-3 py-1 rounded-full animate-pulse">
                URGENTE
              </div>
            )}
          </div>

          {/* Thumbnail strip */}
          {photos.length > 1 && (
            <div className="flex gap-2 mt-3">
              {photos.map((photo, i) => (
                <button key={i} onClick={() => setPhotoIdx(i)}
                  className={`w-16 h-16 rounded-xl overflow-hidden border-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${i === photoIdx ? "border-primary" : "border-transparent"}`}>
                  <img src={photo} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Info */}
        <div className="space-y-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {pet.species === "perro" ? "Perro" : "Gato"}{pet.breed ? ` · ${pet.breed}` : ""}
              </span>
            </div>
            <h1 className="text-4xl font-display font-black mb-2">{pet.name}</h1>

            {/* Attributes grid */}
            <div className="grid grid-cols-2 gap-3 mt-4">
              {[
                { icon: SpeciesIcon, label: "Sexo", value: pet.sex === "macho" ? "Macho" : "Hembra" },
                { icon: Calendar, label: "Edad", value: `${AGE_LABELS[pet.ageCategory] || pet.ageCategory}${pet.ageApprox ? ` (${pet.ageApprox})` : ""}` },
                { icon: Ruler, label: "Tamaño", value: SIZE_LABELS[pet.size] || pet.size },
                { icon: Star, label: "Salud", value: healthInfo.label, valueClass: healthInfo.color },
              ].map(({ icon: Icon, label, value, valueClass }) => (
                <div key={label} className="bg-secondary/50 rounded-2xl p-3">
                  <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
                  <p className={`font-semibold text-sm ${valueClass || ""}`}>{value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Health badges */}
          <div className="flex flex-wrap gap-2">
            {pet.vaccinated && (
              <span className="flex items-center gap-1.5 bg-green-50 border border-green-200 text-green-700 text-xs font-semibold px-3 py-1.5 rounded-full">
                <Syringe className="w-3.5 h-3.5" /> Vacunado
              </span>
            )}
            {pet.sterilized && (
              <span className="flex items-center gap-1.5 bg-blue-50 border border-blue-200 text-blue-700 text-xs font-semibold px-3 py-1.5 rounded-full">
                <Scissors className="w-3.5 h-3.5" /> Esterilizado
              </span>
            )}
            {pet.dewormed && (
              <span className="flex items-center gap-1.5 bg-purple-50 border border-purple-200 text-purple-700 text-xs font-semibold px-3 py-1.5 rounded-full">
                <Shield className="w-3.5 h-3.5" /> Desparasitado
              </span>
            )}
          </div>

          {/* Description */}
          <div>
            <h3 className="font-bold text-base mb-2">Sobre {pet.name}</h3>
            <p className="text-muted-foreground leading-relaxed">{pet.description}</p>
          </div>

          {/* History */}
          {pet.history && (
            <div className="bg-amber-50/60 border border-amber-100 rounded-2xl p-4">
              <h3 className="font-bold text-sm mb-2 text-amber-800">Su historia</h3>
              <p className="text-amber-900 text-sm leading-relaxed">{pet.history}</p>
            </div>
          )}

          {/* Requirements */}
          {pet.adoptionRequirements && (
            <div>
              <h3 className="font-bold text-base mb-2">Requisitos de adopción</h3>
              <p className="text-muted-foreground text-sm leading-relaxed whitespace-pre-line">{pet.adoptionRequirements}</p>
            </div>
          )}

          {/* Location & contact */}
          <div className="bg-secondary/30 rounded-2xl p-4 space-y-2 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <MapPin className="w-4 h-4 shrink-0" /> {pet.location}
            </div>
            {pet.contactPhone && (
              <div className="flex items-center gap-2">
                <Phone className="w-4 h-4 text-muted-foreground shrink-0" />
                <a href={`https://wa.me/51${pet.contactPhone.replace(/\s/g, "")}`} target="_blank" rel="noopener noreferrer" className="text-green-700 font-medium hover:underline">
                  {pet.contactPhone}
                </a>
              </div>
            )}
            {pet.contactEmail && (
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-muted-foreground shrink-0" />
                <a href={`mailto:${pet.contactEmail}`} className="text-primary hover:underline text-sm">{pet.contactEmail}</a>
              </div>
            )}
          </div>

          {/* CTA */}
          {pet.status !== "adopted" && !submitted && (
            <Button
              className="w-full h-14 text-base rounded-2xl shadow-lg shadow-primary/20 hover-elevate"
              onClick={() => setShowForm(true)}
            >
              <Heart className="w-5 h-5 mr-2" /> Quiero adoptar a {pet.name}
            </Button>
          )}
          {submitted && (
            <div className="bg-green-50 border border-green-200 rounded-2xl p-5 text-center">
              <Check className="w-8 h-8 text-green-600 mx-auto mb-2" />
              <p className="font-bold text-green-800">¡Solicitud enviada!</p>
              <p className="text-green-700 text-sm mt-1">El equipo de Red Solidaria revisará tu solicitud y se pondrá en contacto contigo.</p>
            </div>
          )}
        </div>
      </div>

      {/* Adoption Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-background rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="p-6 sm:p-8">
              <div className="flex items-center justify-between mb-6">
                <h2 className="font-display font-bold text-2xl">Solicitud de adopción</h2>
                <button onClick={() => setShowForm(false)} className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center hover:bg-secondary/80">
                  ✕
                </button>
              </div>
              <p className="text-muted-foreground mb-6 text-sm">
                Queremos asegurar que <strong>{pet.name}</strong> vaya al mejor hogar posible. Por favor, completa este formulario con sinceridad.
              </p>

              {submitted ? (
                <div className="text-center py-8">
                  <Check className="w-16 h-16 text-green-500 mx-auto mb-4" />
                  <h3 className="font-bold text-xl mb-2">¡Solicitud enviada!</h3>
                  <p className="text-muted-foreground">Nos pondremos en contacto a la brevedad.</p>
                </div>
              ) : (
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(v => submitRequest.mutate(v))} className="space-y-5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <FormField control={form.control} name="requesterName" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Nombre completo</FormLabel>
                          <FormControl><Input placeholder="Tu nombre" className="rounded-xl bg-secondary/30" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="requesterAge" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Tu edad</FormLabel>
                          <FormControl><Input placeholder="Ej. 28 años" className="rounded-xl bg-secondary/30" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="requesterPhone" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Celular</FormLabel>
                          <FormControl><Input placeholder="921 615 737" className="rounded-xl bg-secondary/30" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="requesterEmail" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email (opcional)</FormLabel>
                          <FormControl><Input type="email" placeholder="tu@email.com" className="rounded-xl bg-secondary/30" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                    </div>

                    <FormField control={form.control} name="requesterAddress" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Dirección</FormLabel>
                        <FormControl><Input placeholder="Tu dirección completa" className="rounded-xl bg-secondary/30" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />

                    <FormField control={form.control} name="housingType" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tipo de vivienda</FormLabel>
                        <div className="grid grid-cols-2 gap-2 mt-1">
                          {HOUSING_TYPES.map(t => (
                            <button key={t.value} type="button" onClick={() => field.onChange(t.value)}
                              className={`px-3 py-2.5 rounded-xl text-sm text-left border-2 transition-colors font-medium ${field.value === t.value ? "border-primary bg-primary/10 text-primary" : "border-border bg-secondary/30 text-muted-foreground"}`}>
                              <Home className="w-4 h-4 inline mr-1.5" />{t.label}
                            </button>
                          ))}
                        </div>
                        <FormMessage />
                      </FormItem>
                    )} />

                    <div className="grid grid-cols-2 gap-4">
                      <div className="flex items-center justify-between bg-secondary/40 rounded-xl p-3">
                        <p className="text-sm font-medium">¿Tienes patio o jardín?</p>
                        <button type="button" role="switch" aria-checked={form.watch("hasYard")} onClick={() => form.setValue("hasYard", !form.watch("hasYard"))}
                          className={`relative w-10 h-5 rounded-full transition-colors ${form.watch("hasYard") ? "bg-primary" : "bg-border"}`}>
                          <span className={`absolute top-0.5 w-4 h-4 bg-card rounded-full shadow transition-transform ${form.watch("hasYard") ? "translate-x-5" : "translate-x-0.5"}`} />
                        </button>
                      </div>
                      <div className="flex items-center justify-between bg-secondary/40 rounded-xl p-3">
                        <p className="text-sm font-medium">¿Experiencia con mascotas?</p>
                        <button type="button" role="switch" aria-checked={form.watch("hasPetExperience")} onClick={() => form.setValue("hasPetExperience", !form.watch("hasPetExperience"))}
                          className={`relative w-10 h-5 rounded-full transition-colors ${form.watch("hasPetExperience") ? "bg-primary" : "bg-border"}`}>
                          <span className={`absolute top-0.5 w-4 h-4 bg-card rounded-full shadow transition-transform ${form.watch("hasPetExperience") ? "translate-x-5" : "translate-x-0.5"}`} />
                        </button>
                      </div>
                    </div>

                    {form.watch("hasPetExperience") && (
                      <FormField control={form.control} name="previousPets" render={({ field }) => (
                        <FormItem>
                          <FormLabel>¿Qué mascotas has tenido?</FormLabel>
                          <FormControl><Input placeholder="Ej. Perro labrador por 8 años" className="rounded-xl bg-secondary/30" {...field} /></FormControl>
                        </FormItem>
                      )} />
                    )}

                    <FormField control={form.control} name="adoptionReason" render={({ field }) => (
                      <FormItem>
                        <FormLabel>¿Por qué quieres adoptar a {pet.name}?</FormLabel>
                        <FormControl>
                          <Textarea placeholder="Cuéntanos tu motivación, cómo sería un día en tu vida con esta mascota..." className="min-h-[100px] rounded-xl bg-secondary/30 resize-none" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />

                    <div className="flex items-center justify-between bg-primary/5 border border-primary/20 rounded-xl p-4">
                      <div>
                        <p className="font-semibold text-sm">Acepto seguimiento post-adopción</p>
                        <p className="text-xs text-muted-foreground">Permitir visitas de verificación en los primeros 3 meses</p>
                      </div>
                      <button type="button" role="switch" aria-checked={form.watch("acceptsFollowUp")} onClick={() => form.setValue("acceptsFollowUp", !form.watch("acceptsFollowUp"))}
                        className={`relative w-10 h-5 rounded-full transition-colors ${form.watch("acceptsFollowUp") ? "bg-primary" : "bg-border"}`}>
                        <span className={`absolute top-0.5 w-4 h-4 bg-card rounded-full shadow transition-transform ${form.watch("acceptsFollowUp") ? "translate-x-5" : "translate-x-0.5"}`} />
                      </button>
                    </div>

                    <Button type="submit" className="w-full h-12 rounded-xl" disabled={submitRequest.isPending}>
                      {submitRequest.isPending ? "Enviando..." : <><Heart className="w-4 h-4 mr-2" /> Enviar solicitud de adopción</>}
                    </Button>
                  </form>
                </Form>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

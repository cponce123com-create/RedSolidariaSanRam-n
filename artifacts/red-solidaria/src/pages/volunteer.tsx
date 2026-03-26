import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import {
  Heart, CheckCircle, ArrowLeft, Users, Clock, Star,
  MapPin, Phone, Mail, Briefcase, HandHeart
} from "lucide-react";

const schema = z.object({
  name: z.string().min(2, "Nombre requerido"),
  email: z.string().email("Email inválido"),
  phone: z.string().optional(),
  age: z.string().optional(),
  district: z.string().optional(),
  availability: z.string().min(1, "Indica tu disponibilidad"),
  skills: z.string().optional(),
  interests: z.string().optional(),
  motivation: z.string().min(20, "Cuéntanos tu motivación (mínimo 20 caracteres)"),
  priorExperience: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

const AVAILABILITY_OPTIONS = [
  { value: "fines-semana", label: "🗓️ Fines de semana" },
  { value: "entre-semana", label: "📆 Entre semana" },
  { value: "ambos", label: "✅ Ambos días" },
  { value: "eventos", label: "🎪 Solo en eventos puntuales" },
  { value: "remoto", label: "💻 Solo remotamente / redes sociales" },
];

const INTEREST_OPTIONS = [
  "Campañas sociales", "Bienestar animal", "Atención a adultos mayores",
  "Apoyo a niños", "Colectas y eventos", "Redes sociales / difusión",
  "Fotografía / video", "Diseño gráfico", "Ayuda legal", "Salud / primeros auxilios",
];

const IMPACT_STATS = [
  { value: "120+", label: "Voluntarios activos" },
  { value: "15", label: "Brigadas de ayuda" },
  { value: "2,400+", label: "Familias ayudadas" },
  { value: "5", label: "Años de trabajo" },
];

export default function Volunteer() {
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
  const { toast } = useToast();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "", email: "", phone: "", age: "", district: "",
      availability: "", skills: "", interests: "", motivation: "", priorExperience: "",
    },
  });

  const toggleInterest = (interest: string) => {
    setSelectedInterests(prev =>
      prev.includes(interest) ? prev.filter(i => i !== interest) : [...prev, interest]
    );
  };

  const onSubmit = async (values: FormValues) => {
    setIsSubmitting(true);
    try {
      const body = { ...values, interests: selectedInterests.join(", ") || values.interests };
      const res = await fetch("/api/volunteers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Error al enviar");
      setSubmitted(true);
    } catch {
      toast({ title: "Error al enviar tu postulación", description: "Por favor intenta de nuevo.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
            <CheckCircle className="w-12 h-12 text-primary" />
          </div>
          <div>
            <h2 className="text-3xl font-display font-bold mb-3">¡Bienvenido/a al equipo!</h2>
            <p className="text-muted-foreground text-lg">Tu postulación fue recibida. El equipo de Red Solidaria se pondrá en contacto contigo pronto para coordinar los siguientes pasos.</p>
          </div>
          <div className="bg-secondary/50 rounded-2xl p-5 text-left text-sm text-muted-foreground space-y-2">
            <p className="font-semibold text-foreground">¿Qué sigue?</p>
            <p>1. Revisamos tu perfil y disponibilidad</p>
            <p>2. Te contactamos por WhatsApp o email</p>
            <p>3. Te invitamos a nuestra próxima reunión de voluntarios</p>
            <p>4. ¡Empezamos a cambiar vidas juntos!</p>
          </div>
          <div className="flex gap-3 justify-center">
            <Link href="/como-ayudar">
              <Button variant="outline" className="rounded-xl">Otras formas de ayudar</Button>
            </Link>
            <Link href="/campanas">
              <Button className="rounded-xl">Ver campañas</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-10 sm:py-16">
      <Link href="/como-ayudar">
        <button className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-8 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Cómo ayudar
        </button>
      </Link>

      {/* Header */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 mb-14">
        <div>
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 bg-primary/10 rounded-2xl"><HandHeart className="w-7 h-7 text-primary" /></div>
            <span className="bg-primary/10 text-primary text-sm font-bold px-3 py-1 rounded-full uppercase tracking-wider">Únete a la red</span>
          </div>
          <h1 className="text-4xl sm:text-5xl font-display font-black mb-4">Sé voluntario/a de Red Solidaria</h1>
          <p className="text-muted-foreground text-lg leading-relaxed">
            No necesitas experiencia previa, solo ganas de ayudar. Tenemos espacio para todas las habilidades, tiempos y perfiles. Juntos llegamos más lejos.
          </p>
        </div>
        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 content-start">
          {IMPACT_STATS.map((stat, i) => (
            <div key={i} className="bg-card border border-border rounded-2xl p-5 text-center shadow-sm">
              <p className="text-3xl font-display font-black text-primary mb-1">{stat.value}</p>
              <p className="text-sm text-muted-foreground">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Benefits strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-12">
        {[
          { icon: Clock, title: "Flexible", desc: "Elige tu propio horario y tipo de participación" },
          { icon: Users, title: "Comunidad", desc: "Formarás parte de una red solidaria real y activa" },
          { icon: Star, title: "Impacto real", desc: "Cada acción tiene un resultado visible en la comunidad" },
        ].map((b, i) => (
          <div key={i} className="flex gap-4 items-start bg-secondary/30 rounded-2xl p-5">
            <div className="p-2 bg-primary/10 rounded-xl shrink-0"><b.icon className="w-5 h-5 text-primary" /></div>
            <div>
              <p className="font-bold mb-0.5">{b.title}</p>
              <p className="text-sm text-muted-foreground">{b.desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Form */}
      <div className="bg-card border border-border rounded-3xl shadow-sm overflow-hidden">
        <div className="bg-gradient-to-r from-primary to-primary/80 p-8 text-white">
          <h2 className="text-2xl font-display font-bold mb-1">Formulario de postulación</h2>
          <p className="text-white/80">Completa los datos con sinceridad — no te tomará más de 5 minutos.</p>
        </div>
        <div className="p-6 sm:p-8">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">

              {/* Datos personales */}
              <section>
                <h3 className="font-bold text-base mb-4 flex items-center gap-2 text-muted-foreground uppercase tracking-wider text-xs">
                  <span className="w-6 h-6 bg-primary text-white rounded-full flex items-center justify-center text-xs font-bold">1</span>
                  Datos personales
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField control={form.control} name="name" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nombre completo *</FormLabel>
                      <FormControl><Input placeholder="Tu nombre" className="rounded-xl bg-secondary/30" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="age" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Edad</FormLabel>
                      <FormControl><Input placeholder="Ej. 25 años" className="rounded-xl bg-secondary/30" {...field} /></FormControl>
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="email" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Correo electrónico *</FormLabel>
                      <FormControl><Input type="email" placeholder="tu@email.com" className="rounded-xl bg-secondary/30" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="phone" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Celular (WhatsApp)</FormLabel>
                      <FormControl><Input placeholder="987 654 321" className="rounded-xl bg-secondary/30" {...field} /></FormControl>
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="district" render={({ field }) => (
                    <FormItem className="sm:col-span-2">
                      <FormLabel>Distrito / Anexo donde vives</FormLabel>
                      <FormControl><Input placeholder="Ej. San Ramón, La Merced, Pichanaki..." className="rounded-xl bg-secondary/30" {...field} /></FormControl>
                    </FormItem>
                  )} />
                </div>
              </section>

              {/* Disponibilidad */}
              <section>
                <h3 className="font-bold text-base mb-4 flex items-center gap-2 text-muted-foreground uppercase tracking-wider text-xs">
                  <span className="w-6 h-6 bg-primary text-white rounded-full flex items-center justify-center text-xs font-bold">2</span>
                  Disponibilidad
                </h3>
                <FormField control={form.control} name="availability" render={({ field }) => (
                  <FormItem>
                    <FormLabel>¿Cuándo puedes participar? *</FormLabel>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">
                      {AVAILABILITY_OPTIONS.map(opt => (
                        <button key={opt.value} type="button" onClick={() => field.onChange(opt.value)}
                          className={`px-4 py-3 rounded-xl text-sm text-left border-2 font-medium transition-all ${field.value === opt.value ? "border-primary bg-primary/10 text-primary" : "border-border bg-secondary/30 text-muted-foreground hover:border-primary/30"}`}>
                          {opt.label}
                        </button>
                      ))}
                    </div>
                    <FormMessage />
                  </FormItem>
                )} />
              </section>

              {/* Habilidades e intereses */}
              <section>
                <h3 className="font-bold text-base mb-4 flex items-center gap-2 text-muted-foreground uppercase tracking-wider text-xs">
                  <span className="w-6 h-6 bg-primary text-white rounded-full flex items-center justify-center text-xs font-bold">3</span>
                  Habilidades e intereses
                </h3>
                <div className="space-y-4">
                  <div>
                    <p className="text-sm font-medium mb-3">¿En qué áreas te gustaría participar? (elige varias)</p>
                    <div className="flex flex-wrap gap-2">
                      {INTEREST_OPTIONS.map(interest => (
                        <button key={interest} type="button" onClick={() => toggleInterest(interest)}
                          className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${selectedInterests.includes(interest) ? "bg-primary text-white border-primary shadow-sm" : "border-border text-muted-foreground hover:border-primary/40 bg-secondary/30"}`}>
                          {interest}
                        </button>
                      ))}
                    </div>
                  </div>
                  <FormField control={form.control} name="skills" render={({ field }) => (
                    <FormItem>
                      <FormLabel>¿Qué habilidades o talentos tienes?</FormLabel>
                      <FormControl><Input placeholder="Ej. manejo de redes, medicina, cocina, carpintería..." className="rounded-xl bg-secondary/30" {...field} /></FormControl>
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="priorExperience" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Experiencia previa en voluntariado (opcional)</FormLabel>
                      <FormControl>
                        <Textarea placeholder="¿Has participado en otras organizaciones o iniciativas? Cuéntanos brevemente..." className="min-h-[80px] rounded-xl bg-secondary/30 resize-none" {...field} />
                      </FormControl>
                    </FormItem>
                  )} />
                </div>
              </section>

              {/* Motivación */}
              <section>
                <h3 className="font-bold text-base mb-4 flex items-center gap-2 text-muted-foreground uppercase tracking-wider text-xs">
                  <span className="w-6 h-6 bg-primary text-white rounded-full flex items-center justify-center text-xs font-bold">4</span>
                  Tu motivación
                </h3>
                <FormField control={form.control} name="motivation" render={({ field }) => (
                  <FormItem>
                    <FormLabel>¿Por qué quieres ser voluntario/a? *</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Cuéntanos qué te motiva, qué esperas aportar, y qué te gustaría aprender o vivir con Red Solidaria..." className="min-h-[110px] rounded-xl bg-secondary/30 resize-none" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </section>

              <Button type="submit" disabled={isSubmitting} className="w-full sm:w-auto px-12 h-14 text-base rounded-2xl shadow-lg shadow-primary/20 hover-elevate">
                {isSubmitting ? (
                  <span className="flex items-center gap-2"><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Enviando...</span>
                ) : (
                  <span className="flex items-center gap-2"><Heart className="w-5 h-5" /> Postularme como voluntario/a</span>
                )}
              </Button>
            </form>
          </Form>
        </div>
      </div>
    </div>
  );
}

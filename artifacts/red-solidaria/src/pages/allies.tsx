import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import {
  Building2, Star, Globe, ArrowRight, HandHeart, Users,
  Heart, Sparkles
} from "lucide-react";

interface Ally {
  id: number; name: string; type: string; logo: string | null;
  description: string | null; website: string | null;
  featured: boolean; active: boolean;
}

const TYPE_LABELS: Record<string, string> = {
  empresa: "Empresa",
  emprendimiento: "Emprendimiento Local",
  institucion: "Institución",
  persona: "Persona Solidaria",
  ong: "ONG / Asociación",
};

const TYPE_COLORS: Record<string, string> = {
  empresa: "bg-blue-100 text-blue-700",
  emprendimiento: "bg-green-100 text-green-700",
  institucion: "bg-purple-100 text-purple-700",
  persona: "bg-rose-100 text-rose-700",
  ong: "bg-amber-100 text-amber-700",
};

function AllyCard({ ally, featured = false }: { ally: Ally; featured?: boolean }) {
  return (
    <motion.div
      whileHover={{ y: -3 }}
      className={`bg-card border rounded-3xl p-6 flex flex-col gap-4 shadow-sm hover:shadow-md transition-all ${featured ? "border-primary/30 ring-1 ring-primary/20" : "border-border"}`}
    >
      {featured && (
        <div className="flex items-center gap-1.5 text-xs text-primary font-bold">
          <Star className="w-3.5 h-3.5 fill-primary" /> Aliado Destacado
        </div>
      )}
      {/* Logo */}
      <div className="w-20 h-20 rounded-2xl bg-secondary flex items-center justify-center overflow-hidden mx-auto">
        {ally.logo ? (
          <img src={ally.logo} alt={ally.name} className="w-full h-full object-contain p-2" />
        ) : (
          <Building2 className="w-10 h-10 text-muted-foreground opacity-30" />
        )}
      </div>
      <div className="text-center">
        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${TYPE_COLORS[ally.type] || "bg-secondary text-foreground"}`}>
          {TYPE_LABELS[ally.type] || ally.type}
        </span>
        <h3 className="font-display font-bold text-xl mt-2 mb-1">{ally.name}</h3>
        {ally.description && <p className="text-muted-foreground text-sm leading-relaxed">{ally.description}</p>}
      </div>
      {ally.website && (
        <a href={ally.website} target="_blank" rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 text-primary text-sm font-medium hover:underline mt-auto">
          <Globe className="w-4 h-4" /> Visitar sitio web
        </a>
      )}
    </motion.div>
  );
}

const HOW_TO_ALLY = [
  {
    icon: Sparkles,
    title: "Patrocinar una campaña",
    desc: "Tu empresa financia total o parcialmente una campaña solidaria. Tu logo aparece en todos los materiales de difusión.",
  },
  {
    icon: HandHeart,
    title: "Donación de productos o servicios",
    desc: "Aporta con lo que tu negocio produce o puede ofrecer. Todo tipo de ayuda en especie es bienvenida.",
  },
  {
    icon: Users,
    title: "Voluntariado corporativo",
    desc: "Organiza una jornada de voluntariado con tu equipo. Una actividad que une y genera impacto real.",
  },
  {
    icon: Heart,
    title: "Convenio de colaboración",
    desc: "Firmamos un convenio formal de cooperación. Ideal para instituciones, municipalidades y ONGs.",
  },
];

const ALLY_BENEFITS = [
  "Logo visible en nuestra web y redes sociales",
  "Mención en campañas que apoyes",
  "Certificado de responsabilidad social",
  "Reportes de impacto de tu aporte",
  "Red de contactos del sector solidario",
  "Visibilidad ante más de 5,000 seguidores",
];

export default function Allies() {
  const { data: allies = [], isLoading } = useQuery<Ally[]>({
    queryKey: ["/api/allies"],
    queryFn: async () => {
      const res = await fetch("/api/allies");
      if (!res.ok) throw new Error("Error");
      return res.json();
    },
  });

  const featured = allies.filter(a => a.featured);
  const regular = allies.filter(a => !a.featured);

  return (
    <div className="max-w-6xl mx-auto px-4 py-10 sm:py-16">
      {/* Hero */}
      <div className="mb-14 text-center max-w-3xl mx-auto">
        <div className="flex items-center gap-3 mb-5 justify-center">
          <div className="p-3 bg-primary/10 rounded-2xl"><Building2 className="w-7 h-7 text-primary" /></div>
          <span className="bg-primary/10 text-primary text-sm font-bold px-3 py-1 rounded-full uppercase tracking-wider">Red de apoyo</span>
        </div>
        <h1 className="text-4xl sm:text-5xl font-display font-black mb-4">Nuestros aliados</h1>
        <p className="text-muted-foreground text-lg leading-relaxed">
          Empresas, emprendimientos locales, instituciones y personas que creen en nuestra misión y nos acompañan para hacer posible el impacto.
        </p>
        <Link href="/contacto">
          <Button className="mt-6 rounded-2xl h-12 px-8 shadow-md hover-elevate">
            <Building2 className="w-4 h-4 mr-2" /> Quiero ser aliado
          </Button>
        </Link>
      </div>

      {/* Allies list */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-14">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-card border border-border rounded-3xl h-52 animate-pulse" />
          ))}
        </div>
      ) : allies.length === 0 ? (
        <div className="text-center py-16 mb-14">
          <Building2 className="w-16 h-16 text-muted-foreground opacity-20 mx-auto mb-4" />
          <h3 className="font-bold text-xl mb-2">Próximamente</h3>
          <p className="text-muted-foreground max-w-sm mx-auto">Estamos construyendo nuestra red de aliados. ¡Sé el primero en sumarte!</p>
          <Link href="/contacto">
            <Button className="mt-5 rounded-xl">Contactar equipo</Button>
          </Link>
        </div>
      ) : (
        <>
          {featured.length > 0 && (
            <div className="mb-12">
              <h2 className="text-2xl font-display font-bold mb-6 flex items-center gap-2">
                <Star className="w-6 h-6 text-primary fill-primary" /> Aliados Destacados
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {featured.map(ally => <AllyCard key={ally.id} ally={ally} featured />)}
              </div>
            </div>
          )}
          {regular.length > 0 && (
            <div className="mb-14">
              {featured.length > 0 && <h2 className="text-xl font-bold mb-6 text-muted-foreground">Toda la red de aliados</h2>}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                {regular.map(ally => <AllyCard key={ally.id} ally={ally} />)}
              </div>
            </div>
          )}
        </>
      )}

      {/* Cómo ser aliado */}
      <div className="mb-14">
        <h2 className="text-3xl font-display font-bold mb-3 text-center">¿Cómo aliarse con nosotros?</h2>
        <p className="text-muted-foreground text-center mb-10 max-w-2xl mx-auto">Hay muchas formas de colaborar. Escoge la que mejor encaje con tus posibilidades y objetivos.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {HOW_TO_ALLY.map((item, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className="bg-card border border-border rounded-3xl p-6 flex gap-5 items-start"
            >
              <div className="p-3 bg-primary/10 rounded-2xl shrink-0">
                <item.icon className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h3 className="font-bold mb-1">{item.title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">{item.desc}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Benefits */}
      <div className="bg-gradient-to-br from-primary/5 to-primary/10 border border-primary/20 rounded-3xl p-8 mb-12">
        <h2 className="text-2xl font-display font-bold mb-2 text-center">Beneficios de ser aliado</h2>
        <p className="text-muted-foreground text-center mb-8 text-sm">Tu apoyo tiene reconocimiento. Esto es lo que obtienes al ser parte de nuestra red:</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {ALLY_BENEFITS.map((b, i) => (
            <div key={i} className="flex items-center gap-3 bg-card/60 rounded-xl px-4 py-3">
              <div className="w-2 h-2 rounded-full bg-primary shrink-0" />
              <p className="text-sm font-medium">{b}</p>
            </div>
          ))}
        </div>
      </div>

      {/* CTA */}
      <div className="bg-card border border-border rounded-3xl p-8 text-center">
        <h3 className="font-display font-bold text-2xl mb-2">¿Listo para sumarte?</h3>
        <p className="text-muted-foreground mb-6 max-w-md mx-auto">Cuéntanos sobre tu empresa o institución y construyamos juntos un plan de colaboración a tu medida.</p>
        <div className="flex gap-4 justify-center flex-wrap">
          <Link href="/contacto">
            <Button className="rounded-2xl h-12 px-8 shadow-md hover-elevate">
              Escribirnos ahora <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </Link>
          <Link href="/como-ayudar">
            <Button variant="outline" className="rounded-2xl h-12 px-8">
              Ver otras formas de ayudar
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

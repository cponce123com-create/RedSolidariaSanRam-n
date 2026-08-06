import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import {
  Dog, Cat, Heart, Shield, Syringe, Home, HandHeart, AlertTriangle,
  ArrowRight, Star, Leaf, Sun, Users, PawPrint
} from "lucide-react";

const WELFARE_SECTIONS = [
  {
    icon: Dog,
    color: "from-amber-50 to-orange-50 border-amber-200",
    iconColor: "text-amber-600",
    badge: "Campaña activa",
    badgeColor: "bg-amber-100 text-amber-700",
    title: "Alimento para perros de la calle",
    description: "San Ramón tiene cientos de perros callejeros que sobreviven día a día. Nuestras rondas de alimentación semanales llegan a los puntos más críticos del distrito con croquetas, agua y amor.",
    stats: [
      { value: "80+", label: "Perros alimentados/semana" },
      { value: "12", label: "Puntos de alimentación" },
    ],
    cta: "Donar alimento",
    ctaHref: "/campanas",
  },
  {
    icon: Home,
    color: "from-blue-50 to-indigo-50 border-blue-200",
    iconColor: "text-blue-600",
    badge: "Apoyo continuo",
    badgeColor: "bg-blue-100 text-blue-700",
    title: "Apoyo a albergues animales",
    description: "Los albergues de la región reciben animales rescatados sin tener recursos suficientes. Apoyamos con comida, medicinas, mantas y materiales de limpieza para que puedan operar.",
    stats: [
      { value: "3", label: "Albergues apoyados" },
      { value: "150+", label: "Animales alojados" },
    ],
    cta: "Apoyar albergues",
    ctaHref: "/campanas",
  },
  {
    icon: Syringe,
    color: "from-green-50 to-emerald-50 border-green-200",
    iconColor: "text-green-600",
    badge: "Jornadas periódicas",
    badgeColor: "bg-green-100 text-green-700",
    title: "Campañas veterinarias",
    description: "Organizamos jornadas de vacunación y esterilización a bajo costo o gratuitas para mascotas de familias con bajos recursos. Trabajamos con veterinarios voluntarios de Chanchamayo.",
    stats: [
      { value: "200+", label: "Animales vacunados" },
      { value: "85+", label: "Esterilizaciones" },
    ],
    cta: "Ver próxima jornada",
    ctaHref: "/noticias",
  },
  {
    icon: AlertTriangle,
    color: "from-red-50 to-rose-50 border-red-200",
    iconColor: "text-red-600",
    badge: "Respuesta rápida",
    badgeColor: "bg-red-100 text-red-700",
    title: "Rescates urgentes",
    description: "Cuando un animal está en peligro — atropellado, herido, en una zona de riesgo o maltratado — activamos nuestra red de voluntarios para rescatarlo, estabilizarlo y buscarle hogar.",
    stats: [
      { value: "60+", label: "Rescates realizados" },
      { value: "48h", label: "Tiempo medio de respuesta" },
    ],
    cta: "Reportar animal",
    ctaHref: "/reportar",
  },
];

const AWARENESS_MSGS = [
  {
    icon: Shield,
    title: "Un perro no es un juguete",
    desc: "Adoptar es un compromiso de vida. Antes de llevar una mascota a casa, evalúa si tienes el tiempo, espacio y recursos para cuidarla bien.",
  },
  {
    icon: Leaf,
    title: "Esteriliza, no abandones",
    desc: "La esterilización previene el abandono y la sobrepoblación. Un animal esterilizado vive más tiempo, es más sano y menos agresivo.",
  },
  {
    icon: Sun,
    title: "Adopta, no compres",
    desc: "Hay miles de animales esperando un hogar. Adoptar salva vidas y no alimenta la cría irresponsable.",
  },
  {
    icon: Heart,
    title: "El maltrato es delito",
    desc: "En el Perú, el maltrato animal está penado por la Ley N.° 30407. Si ves un animal maltratado, repórtalo a las autoridades.",
  },
];

export default function AnimalWelfare() {
  return (
    <div className="max-w-6xl mx-auto px-4 py-10 sm:py-16">
      {/* Hero */}
      <div className="mb-14">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-3 bg-amber-100 rounded-2xl"><PawPrint className="w-7 h-7 text-amber-600" /></div>
          <span className="bg-amber-100 text-amber-700 text-sm font-bold px-3 py-1 rounded-full uppercase tracking-wider">Bienestar Animal</span>
        </div>
        <h1 className="text-4xl sm:text-5xl font-display font-black mb-4">Porque también merecen vivir bien</h1>
        <p className="text-muted-foreground text-lg max-w-2xl leading-relaxed">
          Red Solidaria San Ramón trabaja tanto por las personas como por los animales de nuestra comunidad.
          Creemos que el bienestar animal es parte del tejido solidario de la sociedad.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 mt-8">
          <Link href="/adopciones">
            <Button className="rounded-2xl h-12 px-6 bg-amber-500 hover:bg-amber-600 shadow-md hover-elevate">
              <Dog className="w-4 h-4 mr-2" /> Ver mascotas en adopción
            </Button>
          </Link>
          <Link href="/reportar">
            <Button variant="outline" className="rounded-2xl h-12 px-6 border-red-200 text-red-600 hover:bg-red-50">
              <AlertTriangle className="w-4 h-4 mr-2" /> Reportar animal en peligro
            </Button>
          </Link>
        </div>
      </div>

      {/* Welfare sections */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-16">
        {WELFARE_SECTIONS.map((section, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.1 }}
            className={`bg-gradient-to-br ${section.color} border rounded-3xl p-7 flex flex-col gap-4`}
          >
            <div className="flex items-start justify-between">
              <div className={`p-3 bg-white/70 rounded-2xl`}>
                <section.icon className={`w-7 h-7 ${section.iconColor}`} />
              </div>
              <span className={`text-xs font-bold px-3 py-1 rounded-full ${section.badgeColor}`}>{section.badge}</span>
            </div>

            <div>
              <h3 className="font-display font-bold text-xl mb-2">{section.title}</h3>
              <p className="text-muted-foreground leading-relaxed text-sm">{section.description}</p>
            </div>

            <div className="flex gap-6">
              {section.stats.map((stat, j) => (
                <div key={j}>
                  <p className="text-2xl font-display font-bold">{stat.value}</p>
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                </div>
              ))}
            </div>

            <Link href={section.ctaHref}>
              <Button
                size="sm"
                className={`rounded-xl h-9 mt-auto bg-white/80 hover:bg-white text-foreground border border-white/50 shadow-sm gap-1.5`}
              >
                {section.cta} <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </Link>
          </motion.div>
        ))}
      </div>

      {/* Adopción responsable CTA */}
      <div className="bg-gradient-to-br from-amber-400 to-orange-500 rounded-3xl p-8 sm:p-12 text-white text-center mb-16 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <Dog className="absolute -left-8 -bottom-8 w-64 h-64" />
          <Cat className="absolute -right-8 -top-8 w-48 h-48" />
        </div>
        <div className="relative z-10">
          <PawPrint className="w-14 h-14 mx-auto mb-5 opacity-90" />
          <h2 className="text-3xl sm:text-4xl font-display font-black mb-4">¿Listo para dar un hogar?</h2>
          <p className="text-white/90 text-lg mb-8 max-w-2xl mx-auto">
            Tenemos perros y gatos esperando una familia responsable. Cada adopción es una vida que se transforma — la de ellos y la tuya.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/adopciones">
              <Button size="lg" className="bg-white text-amber-700 hover:bg-white/90 rounded-2xl h-14 px-10 font-bold shadow-xl">
                <Heart className="w-5 h-5 mr-2" /> Ver mascotas disponibles
              </Button>
            </Link>
            <Link href="/publicar-mascota">
              <Button size="lg" variant="outline" className="border-white text-white hover:bg-white/20 rounded-2xl h-14 px-10 font-semibold">
                Publicar en adopción
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Mensajes de concientización */}
      <div className="mb-16">
        <h2 className="text-3xl font-display font-bold mb-3 text-center">Adopción responsable</h2>
        <p className="text-muted-foreground text-center mb-10">Tener una mascota es un compromiso hermoso. Estos son nuestros principios.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {AWARENESS_MSGS.map((msg, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className="bg-card border border-border rounded-3xl p-6 flex flex-col items-center text-center gap-3"
            >
              <div className="w-14 h-14 bg-primary/10 rounded-full flex items-center justify-center">
                <msg.icon className="w-7 h-7 text-primary" />
              </div>
              <h3 className="font-display font-bold text-base">{msg.title}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">{msg.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Cómo ayudar */}
      <div className="bg-secondary/30 rounded-3xl p-8 text-center">
        <h3 className="font-display font-bold text-2xl mb-2">¿Cómo puedes ayudar?</h3>
        <p className="text-muted-foreground mb-8">No necesitas adoptar para marcar la diferencia.</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 text-left mb-8">
          {[
            { icon: HandHeart, title: "Ser voluntario", desc: "Únete a nuestras jornadas de alimentación, vacunación o rescate. Un sábado al mes puede cambiar muchas vidas.", href: "/contacto" },
            { icon: Users, title: "Hogar temporal", desc: "Acoger una mascota por semanas mientras encuentra familia definitiva. Es temporal pero transforma su vida.", href: "/contacto" },
            { icon: Heart, title: "Donar", desc: "Alimento, medicinas, mantas o dinero para nuestras campañas veterinarias y de alimentación callejera.", href: "/campanas" },
          ].map((item, i) => (
            <Link href={item.href} key={i}>
              <div className="bg-card border border-border rounded-2xl p-5 hover:shadow-md transition-shadow cursor-pointer h-full">
                <item.icon className="w-7 h-7 text-primary mb-3" />
                <h4 className="font-bold mb-1">{item.title}</h4>
                <p className="text-muted-foreground text-sm leading-relaxed">{item.desc}</p>
              </div>
            </Link>
          ))}
        </div>
        <Link href="/contacto">
          <Button className="rounded-2xl px-8 h-12">
            Quiero ser voluntario animalista <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </Link>
      </div>
    </div>
  );
}

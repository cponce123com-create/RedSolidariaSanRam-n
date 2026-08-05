import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import {
  Heart, HandHeart, Package, Dog, Users, Building2, Megaphone,
  ArrowRight, CheckCircle, Phone, QrCode, Banknote, CreditCard,
  Gift, Leaf, Star
} from "lucide-react";

const HELP_WAYS = [
  {
    id: "donar-dinero",
    icon: Heart,
    color: "from-red-50 to-rose-50 border-red-200",
    iconBg: "bg-red-100",
    iconColor: "text-red-600",
    badge: "Impacto inmediato",
    badgeColor: "bg-red-100 text-red-700",
    title: "Donar dinero",
    description: "Tu donación llega directamente a las campañas más urgentes. Desde S/ 5 ya puedes marcar una diferencia real. Usamos Yape, Plin, BCP o efectivo.",
    steps: [
      "Elige la campaña que más te mueve",
      "Dona por Yape (921 615 737) o Plin (921 615 737)",
      "Envíanos el comprobante por WhatsApp",
    ],
    cta: "Ver campañas",
    ctaHref: "/campanas",
    ctaStyle: "bg-red-500 hover:bg-red-600",
  },
  {
    id: "donar-productos",
    icon: Package,
    color: "from-blue-50 to-indigo-50 border-blue-200",
    iconBg: "bg-blue-100",
    iconColor: "text-blue-600",
    badge: "Donación en especie",
    badgeColor: "bg-blue-100 text-blue-700",
    title: "Donar productos",
    description: "Ropa en buen estado, útiles escolares, alimentos no perecibles, medicamentos, mantas, herramientas — todo suma. Coordinamos la recepción.",
    steps: [
      "Selecciona los artículos a donar",
      "Contáctanos por WhatsApp",
      "Coordinamos la entrega o recojo",
    ],
    cta: "Contactar equipo",
    ctaHref: "/contacto",
    ctaStyle: "bg-blue-500 hover:bg-blue-600",
  },
  {
    id: "donar-alimento",
    icon: Dog,
    color: "from-amber-50 to-orange-50 border-amber-200",
    iconBg: "bg-amber-100",
    iconColor: "text-amber-600",
    badge: "Bienestar animal",
    badgeColor: "bg-amber-100 text-amber-700",
    title: "Donar alimento animal",
    description: "Croquetas, balanceado, latas o donaciones en efectivo para nuestro programa de alimentación de perros callejeros y apoyo a albergues de la región.",
    steps: [
      "Cualquier marca de croqueta ayuda",
      "Lo recibimos en San Ramón o coordinamos recojo",
      "También puedes apoyar las campañas veterinarias",
    ],
    cta: "Ver ayuda animal",
    ctaHref: "/ayuda-animal",
    ctaStyle: "bg-amber-500 hover:bg-amber-600",
  },
  {
    id: "voluntario",
    icon: HandHeart,
    color: "from-green-50 to-emerald-50 border-green-200",
    iconBg: "bg-green-100",
    iconColor: "text-green-600",
    badge: "Más demandado",
    badgeColor: "bg-green-100 text-green-700",
    title: "Ser voluntario/a",
    description: "Únete a nuestra red de más de 120 voluntarios. Tenemos espacio para todas las habilidades: atención directa, redes sociales, fotografía, salud, logística y más.",
    steps: [
      "Completa el formulario de postulación",
      "Nos contactamos para conocerte",
      "Te asignamos según tus intereses y disponibilidad",
    ],
    cta: "Postularme",
    ctaHref: "/voluntariado",
    ctaStyle: "bg-green-600 hover:bg-green-700",
  },
  {
    id: "aliado",
    icon: Building2,
    color: "from-purple-50 to-violet-50 border-purple-200",
    iconBg: "bg-purple-100",
    iconColor: "text-purple-600",
    badge: "Impacto social",
    badgeColor: "bg-purple-100 text-purple-700",
    title: "Ser aliado / auspiciador",
    description: "Si representas una empresa, emprendimiento o institución, puedes apoyarnos con recursos, visibilidad, auspicios o convenios. Trabajamos juntos por la comunidad.",
    steps: [
      "Contáctanos para conocer formas de alianza",
      "Diseñamos juntos el tipo de colaboración",
      "Tu marca aparece en nuestros materiales",
    ],
    cta: "Conversar",
    ctaHref: "/contacto",
    ctaStyle: "bg-purple-600 hover:bg-purple-700",
  },
  {
    id: "difundir",
    icon: Megaphone,
    color: "from-yellow-50 to-amber-50 border-yellow-200",
    iconBg: "bg-yellow-100",
    iconColor: "text-yellow-600",
    badge: "Sin costo",
    badgeColor: "bg-yellow-100 text-yellow-700",
    title: "Difundir campañas",
    description: "Comparte nuestras publicaciones, campañas y casos urgentes en tus redes sociales. Un share puede ser la diferencia entre que una familia reciba ayuda o no.",
    steps: [
      "Síguenos en redes sociales",
      "Comparte campañas activas con tus contactos",
      "Etiquétanos cuando difundas — nos ayuda mucho",
    ],
    cta: "Ver campañas",
    ctaHref: "/campanas",
    ctaStyle: "bg-yellow-500 hover:bg-yellow-600",
  },
];

const PAYMENT_METHODS = [
  { icon: QrCode, label: "Yape", value: "921 615 737", color: "text-purple-600" },
  { icon: QrCode, label: "Plin", value: "921 615 737", color: "text-blue-600" },
  { icon: Banknote, label: "BCP", value: "193-12345678-0-55", color: "text-orange-600" },
  { icon: CreditCard, label: "Efectivo", value: "Coordinamos en San Ramón", color: "text-green-600" },
];

export default function HowToHelp() {
  return (
    <div className="max-w-6xl mx-auto px-4 py-10 sm:py-16">
      {/* Hero */}
      <div className="mb-14 text-center max-w-3xl mx-auto">
        <div className="flex items-center gap-3 mb-5 justify-center">
          <div className="p-3 bg-primary/10 rounded-2xl"><HandHeart className="w-7 h-7 text-primary" /></div>
          <span className="bg-primary/10 text-primary text-sm font-bold px-3 py-1 rounded-full uppercase tracking-wider">Participa</span>
        </div>
        <h1 className="text-4xl sm:text-5xl font-display font-black mb-4">¿Cómo puedes ayudar?</h1>
        <p className="text-muted-foreground text-lg leading-relaxed">
          Cada persona tiene algo que aportar. Elige la forma que mejor se adapte a ti — todas son igualmente valiosas.
        </p>
      </div>

      {/* Ways to help grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-16">
        {HELP_WAYS.map((way, i) => (
          <motion.div
            key={way.id}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.08 }}
            className={`bg-gradient-to-br ${way.color} border rounded-3xl p-7 flex flex-col gap-4`}
          >
            <div className="flex items-start justify-between">
              <div className={`p-3 ${way.iconBg} rounded-2xl`}>
                <way.icon className={`w-7 h-7 ${way.iconColor}`} />
              </div>
              <span className={`text-xs font-bold px-3 py-1 rounded-full ${way.badgeColor}`}>{way.badge}</span>
            </div>
            <div>
              <h3 className="font-display font-bold text-xl mb-2">{way.title}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">{way.description}</p>
            </div>
            <div className="space-y-1.5">
              {way.steps.map((step, j) => (
                <div key={j} className="flex items-start gap-2 text-xs text-muted-foreground">
                  <CheckCircle className="w-3.5 h-3.5 text-green-500 shrink-0 mt-0.5" />
                  {step}
                </div>
              ))}
            </div>
            <Link href={way.ctaHref}>
              <Button size="sm" className={`rounded-xl mt-auto gap-1.5 ${way.ctaStyle} text-white`}>
                {way.cta} <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </Link>
          </motion.div>
        ))}
      </div>

      {/* Payment methods */}
      <div className="bg-card border border-border rounded-3xl p-8 mb-12">
        <h2 className="text-2xl font-display font-bold mb-2 text-center">Métodos de pago para donaciones</h2>
        <p className="text-muted-foreground text-center mb-8 text-sm">Elige el método que más te convenga. Todas las donaciones son transparentes y reportadas mensualmente.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {PAYMENT_METHODS.map((pm, i) => (
            <div key={i} className="bg-secondary/40 rounded-2xl p-5 text-center border border-border">
              <pm.icon className={`w-8 h-8 mx-auto mb-3 ${pm.color}`} />
              <p className="font-bold mb-1">{pm.label}</p>
              <p className="text-xs text-muted-foreground">{pm.value}</p>
            </div>
          ))}
        </div>
        <p className="text-center text-sm text-muted-foreground mt-6">
          Después de tu donación, envía el comprobante al{" "}
          <a href="https://wa.me/51921615737" className="text-green-600 font-semibold hover:underline">WhatsApp 921 615 737</a>
        </p>
      </div>

      {/* Allies CTA */}
      <div className="bg-gradient-to-r from-primary to-primary/80 rounded-3xl p-8 sm:p-12 text-white text-center mb-12">
        <Building2 className="w-12 h-12 mx-auto mb-4 opacity-90" />
        <h2 className="text-3xl font-display font-bold mb-3">¿Representas una empresa o institución?</h2>
        <p className="text-white/85 text-lg mb-6 max-w-xl mx-auto">Únete como aliado de Red Solidaria. Trabajamos con emprendimientos locales, instituciones y empresas que quieren impactar positivamente en Chanchamayo.</p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link href="/aliados">
            <Button size="lg" className="bg-white text-primary hover:bg-white/90 rounded-2xl h-12 px-8 font-bold">
              Ver nuestros aliados
            </Button>
          </Link>
          <Link href="/contacto">
            <Button size="lg" variant="outline" className="border-white text-white hover:bg-white/20 rounded-2xl h-12 px-8">
              Ser aliado
            </Button>
          </Link>
        </div>
      </div>

      {/* FAQ rapida */}
      <div className="bg-secondary/30 rounded-3xl p-8">
        <h3 className="text-2xl font-display font-bold mb-6 text-center">Preguntas frecuentes</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {[
            { q: "¿Las donaciones son deducibles de impuestos?", a: "Trabajamos en ello. Por ahora emitimos constancia de donación para quienes la necesiten." },
            { q: "¿Cómo sé que mi donación llegó?", a: "Todas las donaciones aprobadas aparecen en el Dashboard de Transparencia de cada campaña." },
            { q: "¿Puedo donar desde otra ciudad?", a: "Sí. Las donaciones por Yape, Plin o BCP funcionan desde cualquier parte del Perú." },
            { q: "¿Hay un monto mínimo para donar?", a: "No. Desde S/ 1 ya es una donación bienvenida. Cada sol suma para la causa." },
          ].map((faq, i) => (
            <div key={i} className="bg-card border border-border rounded-2xl p-5">
              <p className="font-bold text-sm mb-2">{faq.q}</p>
              <p className="text-muted-foreground text-sm">{faq.a}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

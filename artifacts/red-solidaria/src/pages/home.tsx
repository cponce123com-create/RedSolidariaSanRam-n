import { motion } from "framer-motion";
import { Link } from "wouter";
import { useGetStats, useGetCampaigns, useGetTestimonials } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { CampaignCard } from "@/components/shared/CampaignCard";
import { Heart, Users, Gift, ShieldCheck, PawPrint } from "lucide-react";

export default function Home() {
  const { data: stats } = useGetStats();
  const { data: campaigns } = useGetCampaigns({ featured: true, status: "active" });
  const { data: testimonials } = useGetTestimonials();

  return (
    <div className="min-h-screen pt-20">
      {/* HERO SECTION */}
      <section className="relative overflow-hidden bg-background">
        <div className="absolute inset-0 z-0">
          <img 
            src={`${import.meta.env.BASE_URL}images/abstract-bg.png`} 
            alt="Hero Background" 
            className="w-full h-full object-cover opacity-60"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-background/80 to-background"></div>
        </div>
        
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 pt-20 pb-32 lg:pt-32 lg:pb-48 flex flex-col items-center text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary font-medium text-sm mb-8"
          >
            <Heart className="w-4 h-4" /> San Ramón, Chanchamayo
          </motion.div>
          
          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="text-5xl md:text-6xl lg:text-7xl font-display font-extrabold text-foreground tracking-tight max-w-4xl leading-tight mb-6"
          >
            Uniendo corazones, <span className="text-primary">transformando vidas</span>
          </motion.h1>
          
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-xl md:text-2xl text-muted-foreground max-w-2xl mb-10 leading-relaxed"
          >
            Empezamos llevando sonrisas en Navidad. Hoy somos una red de voluntarios comprometidos con el bienestar de niños, familias y animales en nuestra comunidad.
          </motion.p>
          
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto"
          >
            <Link href="/campanas">
              <Button size="lg" className="w-full sm:w-auto rounded-xl text-lg h-14 px-8 shadow-xl shadow-primary/25 hover:-translate-y-1 transition-transform">
                Donar Ahora
              </Button>
            </Link>
            <Link href="/nosotros">
              <Button size="lg" variant="outline" className="w-full sm:w-auto rounded-xl text-lg h-14 px-8 bg-white/50 backdrop-blur-sm border-border hover:bg-white/80">
                Nuestra Historia
              </Button>
            </Link>
          </motion.div>
        </div>
      </section>

      {/* STATS SECTION */}
      <section className="py-20 bg-primary text-primary-foreground relative -mt-10 rounded-t-[3rem] z-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-12 text-center divide-x-0 md:divide-x divide-primary-foreground/20">
            {[
              { value: stats?.childrenHelped || "2,000+", label: "Niños Beneficiados" },
              { value: stats?.campaignsRun || "45+", label: "Campañas Exitosas" },
              { value: stats?.volunteers || "120+", label: "Voluntarios Activos" },
              { value: stats?.animalsHelped || "300+", label: "Animales Rescatados" },
            ].map((stat, i) => (
              <motion.div 
                key={i}
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="flex flex-col items-center"
              >
                <div className="text-4xl md:text-5xl font-display font-bold mb-2">{stat.value}</div>
                <div className="text-sm md:text-base text-primary-foreground/80 font-medium uppercase tracking-wider">{stat.label}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* FEATURED CAMPAIGNS */}
      <section className="py-24 bg-secondary/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row justify-between items-end mb-12 gap-6">
            <div className="max-w-2xl">
              <h2 className="text-3xl md:text-4xl font-display font-bold mb-4">Campañas Destacadas</h2>
              <p className="text-lg text-muted-foreground">Únete a nuestras iniciativas actuales y ayúdanos a llegar a la meta. Cada sol suma a la causa.</p>
            </div>
            <Link href="/campanas">
              <Button variant="outline" className="rounded-xl bg-white">Ver todas las campañas</Button>
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {campaigns?.slice(0, 3).map((campaign) => (
              <CampaignCard key={campaign.id} campaign={campaign} />
            ))}
            {!campaigns?.length && (
              <div className="col-span-full text-center py-12 text-muted-foreground">
                Cargando campañas...
              </div>
            )}
          </div>
        </div>
      </section>

      {/* HOW TO HELP */}
      <section className="py-24 bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-3xl md:text-4xl font-display font-bold mb-4">Múltiples Formas de Ayudar</h2>
            <p className="text-lg text-muted-foreground">No solo necesitamos aportes económicos. Tu tiempo, habilidades y donaciones en especie son invaluables.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { icon: Heart, title: "Aporte Económico", desc: "Ayuda directa a nuestras campañas para comprar víveres y medicinas.", color: "bg-primary/10 text-primary" },
              { icon: Gift, title: "Donar Productos", desc: "Recibimos ropa, víveres, juguetes y comida para animales.", color: "bg-blue-500/10 text-blue-500" },
              { icon: Users, title: "Ser Voluntario", desc: "Suma tus manos en las actividades de campo y logística.", color: "bg-orange-500/10 text-orange-500" },
              { icon: PawPrint, title: "Ayuda Animal", desc: "Apoya en rescates, donando alimento o dando hogar temporal.", color: "bg-accent/10 text-accent" },
            ].map((item, i) => (
              <motion.div 
                key={i}
                whileHover={{ y: -5 }}
                className="bg-card p-8 rounded-2xl border border-border/50 shadow-sm hover:shadow-lg transition-all text-center flex flex-col items-center"
              >
                <div className={`w-16 h-16 rounded-full ${item.color} flex items-center justify-center mb-6`}>
                  <item.icon className="w-8 h-8" />
                </div>
                <h3 className="font-display font-bold text-xl mb-3">{item.title}</h3>
                <p className="text-muted-foreground text-sm">{item.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* TRANSPARENCY CTA */}
      <section className="py-20 relative overflow-hidden">
        {/* bg smiling kids abstract unplash image */}
        <img 
          src="https://images.unsplash.com/photo-1593113598332-cd288d649433?w=1600&q=80" 
          alt="Kids playing" 
          className="absolute inset-0 w-full h-full object-cover opacity-20"
        />
        <div className="absolute inset-0 bg-primary/90 mix-blend-multiply" />
        
        <div className="max-w-4xl mx-auto px-4 relative z-10 text-center text-white">
          <ShieldCheck className="w-16 h-16 mx-auto mb-6 opacity-90" />
          <h2 className="text-3xl md:text-5xl font-display font-bold mb-6">100% Transparencia</h2>
          <p className="text-lg md:text-xl text-white/90 mb-10 leading-relaxed">
            Creemos que la confianza es la base de la solidaridad. Publicamos reportes detallados, boletas y evidencias fotográficas de cada céntimo que entra y sale de la organización.
          </p>
          <Link href="/nosotros">
            <Button size="lg" className="bg-white text-primary hover:bg-white/90 rounded-xl text-lg h-14 px-8">
              Conoce nuestro método
            </Button>
          </Link>
        </div>
      </section>
    </div>
  );
}

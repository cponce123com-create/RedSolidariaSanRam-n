import { motion } from "framer-motion";
import { Shield, Target, Heart, Users } from "lucide-react";
import SEO from "@/components/shared/SEO";

export default function About() {
  return (
    <div className="min-h-screen pt-20 bg-background">
      <SEO
        title="Quiénes Somos"
        description="Conoce la historia, misión y valores de Red Solidaria San Ramón. Una organización comprometida con el bienestar de la comunidad de Chanchamayo."
        url="/nosotros"
      />
      {/* HEADER */}
      <section className="py-20 bg-secondary/30 border-b border-border/50 text-center px-4">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-4xl md:text-5xl font-display font-bold mb-6">Quiénes Somos</h1>
          <p className="text-xl text-muted-foreground leading-relaxed">
            Una organización nacida en San Ramón, Chanchamayo, con el propósito de llevar esperanza a donde más se necesita.
          </p>
        </div>
      </section>

      {/* HISTORY */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid md:grid-cols-2 gap-12 items-center">
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            className="space-y-6"
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary font-medium text-sm">
              <Heart className="w-4 h-4" /> Nuestra Historia
            </div>
            <h2 className="text-3xl md:text-4xl font-display font-bold">De una chocolatada a una red de amor</h2>
            <p className="text-lg text-muted-foreground leading-relaxed">
              Todo comenzó con un grupo de amigos que decidió juntar fondos para llevar juguetes y una chocolatada a los niños de los anexos más alejados de San Ramón en Navidad.
            </p>
            <p className="text-lg text-muted-foreground leading-relaxed">
              Al ver la realidad y las necesidades que iban más allá de una fecha festiva, decidimos organizarnos. Hoy, Red Solidaria San Ramón no solo realiza campañas navideñas, sino que asiste en casos sociales, apoyo médico y rescate animal durante todo el año.
            </p>
          </motion.div>
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            className="relative h-[400px] rounded-3xl overflow-hidden shadow-2xl"
          >
            {/* volunteers smiling working */}
            <img 
              src="https://images.unsplash.com/photo-1559027615-cd4628902d4a?w=800&q=80" 
              alt="Voluntarios" 
              className="w-full h-full object-cover"
            />
          </motion.div>
        </div>
      </section>

      {/* M/V/V */}
      <section className="py-20 bg-primary text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid md:grid-cols-3 gap-8">
          <div className="bg-white/10 p-8 rounded-2xl backdrop-blur-sm border border-white/20">
            <Target className="w-12 h-12 mb-6 text-white/90" />
            <h3 className="text-2xl font-display font-bold mb-4">Misión</h3>
            <p className="text-white/80 leading-relaxed">
              Brindar asistencia solidaria a las poblaciones vulnerables y animales en abandono en Chanchamayo, promoviendo la empatía comunitaria y canalizando recursos de manera transparente.
            </p>
          </div>
          <div className="bg-white/10 p-8 rounded-2xl backdrop-blur-sm border border-white/20">
            <Shield className="w-12 h-12 mb-6 text-white/90" />
            <h3 className="text-2xl font-display font-bold mb-4">Visión</h3>
            <p className="text-white/80 leading-relaxed">
              Ser la red de ayuda social más grande y confiable de la Selva Central, logrando un impacto sostenible que mejore la calidad de vida de nuestra comunidad.
            </p>
          </div>
          <div className="bg-white/10 p-8 rounded-2xl backdrop-blur-sm border border-white/20">
            <Users className="w-12 h-12 mb-6 text-white/90" />
            <h3 className="text-2xl font-display font-bold mb-4">Valores</h3>
            <ul className="space-y-2 text-white/80">
              <li className="flex items-center gap-2">✓ Transparencia absoluta</li>
              <li className="flex items-center gap-2">✓ Empatía y respeto</li>
              <li className="flex items-center gap-2">✓ Trabajo en equipo</li>
              <li className="flex items-center gap-2">✓ Compromiso social</li>
            </ul>
          </div>
        </div>
      </section>
      
    </div>
  );
}

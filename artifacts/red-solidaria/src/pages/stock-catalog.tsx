import { motion } from "framer-motion";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Armchair, 
  Walk, 
  Bed, 
  Utensils, 
  Flame, 
  Shirt, 
  HeartHandshake,
  MessageCircle,
  Package,
  Info
} from "lucide-react";

interface StockItem {
  id: number;
  name: string;
  category: string;
  description: string;
  icon: React.ElementType;
  inStock: boolean;
  stockLevel: "high" | "medium" | "low" | "none";
  canSponsor: boolean;
  sponsorMessage?: string;
}

const STOCK_ITEMS: StockItem[] = [
  {
    id: 1,
    name: "Sillas de Ruedas",
    category: "Movilidad",
    description: "Sillas de ruedas manuales plegables para adultos y niños. Incluye modelos estándar y livianos.",
    icon: Armchair,
    inStock: true,
    stockLevel: "medium",
    canSponsor: true,
    sponsorMessage: "Una silla de ruedas puede cambiar la vida de alguien. ¡Ayúdanos a mantener este stock!"
  },
  {
    id: 2,
    name: "Andadores",
    category: "Movilidad",
    description: "Andadores ortopédicos regulables con ruedas y frenos. Disponibles en diferentes alturas.",
    icon: Walk,
    inStock: true,
    stockLevel: "high",
    canSponsor: true,
    sponsorMessage: "Los andadores brindan independencia a nuestros adultos mayores. ¡Patrocina uno hoy!"
  },
  {
    id: 3,
    name: "Férulas",
    category: "Ortopedia",
    description: "Férulas inmovilizadoras para extremidades superiores e inferiores. Varios tamaños disponibles.",
    icon: Package,
    inStock: true,
    stockLevel: "medium",
    canSponsor: true,
    sponsorMessage: "Las férulas son esenciales para recuperaciones. ¡Tu aporte marca la diferencia!"
  },
  {
    id: 4,
    name: "Muletas",
    category: "Movilidad",
    description: "Muletas axilares y antebrales ajustables. Material resistente y ergonómico.",
    icon: Walk,
    inStock: true,
    stockLevel: "high",
    canSponsor: true,
    sponsorMessage: "Las muletas ayudan en la recuperación de lesiones. ¡Apóyanos con tu donación!"
  },
  {
    id: 5,
    name: "Ropa",
    category: "Vestimenta",
    description: "Ropa nueva y en buen estado para todas las edades. Incluye abrigos, polos, pantalones y calzado.",
    icon: Shirt,
    inStock: true,
    stockLevel: "high",
    canSponsor: true,
    sponsorMessage: "La ropa dignifica y protege. ¡Dona prendas nuevas o en excelente estado!"
  },
  {
    id: 6,
    name: "Camas Hospitalarias",
    category: "Equipamiento Médico",
    description: "Camas hospitalarias manuales con barandas ajustables. Ideales para cuidado en casa.",
    icon: Bed,
    inStock: true,
    stockLevel: "low",
    canSponsor: true,
    sponsorMessage: "Una cama hospitalaria es vital para pacientes en recuperación. ¡Patrocina una hoy!"
  },
  {
    id: 7,
    name: "Balones de Gas",
    category: "Servicios Básicos",
    description: "Balones de gas de 10kg para familias vulnerables. Programa de recarga mensual disponible.",
    icon: Flame,
    inStock: true,
    stockLevel: "medium",
    canSponsor: true,
    sponsorMessage: "El gas es esencial para cocinar. ¡Ayúdanos a llevar calor a los hogares!"
  },
  {
    id: 8,
    name: "Cocinas",
    category: "Equipamiento del Hogar",
    description: "Cocinas a gas de 4 hornillas nuevas. Para familias que carecen de equipos básicos.",
    icon: Utensils,
    inStock: true,
    stockLevel: "low",
    canSponsor: true,
    sponsorMessage: "Una cocina permite preparar alimentos calientes. ¡Patrocina una familia hoy!"
  },
];

const STOCK_LEVEL_CONFIG = {
  high: { label: "Disponible", color: "bg-green-500" },
  medium: { label: "Stock Medio", color: "bg-yellow-500" },
  low: { label: "Pocas Unidades", color: "bg-orange-500" },
  none: { label: "Agotado", color: "bg-red-500" },
};

const CATEGORY_FILTERS = ["Todos", "Movilidad", "Ortopedia", "Vestimenta", "Equipamiento Médico", "Servicios Básicos", "Equipamiento del Hogar"];

export default function StockCatalog() {
  const handleSponsorClick = (item: StockItem) => {
    const phoneNumber = "51999999999"; // Reemplazar con el número real de WhatsApp
    const message = encodeURIComponent(
      `Hola Red Solidaria San Ramón 👋\n\nEstoy interesado en patrocinar: *${item.name}*.\n\n${item.sponsorMessage || "Más información por favor."}\n\n¡Gracias por su labor!`
    );
    window.open(`https://wa.me/${phoneNumber}?text=${message}`, "_blank");
  };

  const handleGeneralSponsorClick = () => {
    const phoneNumber = "51999999999"; // Reemplazar con el número real de WhatsApp
    const message = encodeURIComponent(
      "Hola Red Solidaria San Ramón 👋\n\nMe gustaría patrocinar algún producto del catálogo. ¿Qué necesitan con más urgencia?\n\n¡Gracias por su labor!"
    );
    window.open(`https://wa.me/${phoneNumber}?text=${message}`, "_blank");
  };

  return (
    <div className="min-h-screen pt-20 pb-16 bg-gradient-to-b from-background to-secondary/30">
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-primary/5 py-16">
        <div className="absolute inset-0 z-0">
          <div className="absolute top-0 right-0 w-96 h-96 rounded-full bg-teal-100/40 blur-3xl -translate-y-1/3 translate-x-1/4"></div>
          <div className="absolute bottom-0 left-0 w-80 h-80 rounded-full bg-blue-100/50 blur-3xl translate-y-1/3 -translate-x-1/4"></div>
        </div>
        
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center max-w-4xl mx-auto"
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary font-medium text-sm mb-6">
              <Package className="w-4 h-4" /> Almacén Solidario
            </div>
            
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-display font-extrabold text-foreground tracking-tight mb-6">
              Catálogo de Productos en <span className="text-primary">Stock</span>
            </h1>
            
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-8 leading-relaxed">
              Estos son los productos que mantenemos disponibles para ayudar a quienes más lo necesitan. 
              Tu apoyo nos permite mantener este almacén siempre abastecido.
            </p>

            <Button 
              size="lg" 
              className="rounded-xl text-lg h-14 px-8 shadow-xl shadow-green-500/25 hover:-translate-y-1 transition-transform bg-green-600 hover:bg-green-700"
              onClick={handleGeneralSponsorClick}
            >
              <HeartHandshake className="w-5 h-5 mr-2" />
              Patrocinar un Producto
              <MessageCircle className="w-4 h-4 ml-2" />
            </Button>
          </motion.div>
        </div>
      </section>

      {/* Info Banner */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-8 relative z-20">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="bg-white border border-border rounded-2xl p-6 shadow-lg"
        >
          <div className="flex items-start gap-4">
            <div className="p-3 bg-blue-50 rounded-xl">
              <Info className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h3 className="font-display font-bold text-lg mb-2">¿Cómo funciona nuestro almacén?</h3>
              <p className="text-muted-foreground leading-relaxed">
                Mantenemos un stock permanente de productos esenciales para responder rápidamente a emergencias y necesidades 
                cotidianas de nuestra comunidad. Cada producto puede ser patrocinado individualmente, asegurando que llegue 
                directamente a quien lo necesita. La transparencia es nuestra prioridad: reportamos cada entrega con evidencia fotográfica.
              </p>
            </div>
          </div>
        </motion.div>
      </section>

      {/* Products Grid */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
        >
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
            <div>
              <h2 className="text-3xl font-display font-bold mb-2">Productos Disponibles</h2>
              <p className="text-muted-foreground">Selecciona un producto para patrocinarlo vía WhatsApp</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {STOCK_ITEMS.map((item, index) => {
              const Icon = item.icon;
              const stockConfig = STOCK_LEVEL_CONFIG[item.stockLevel];
              
              return (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.1 * index }}
                  whileHover={{ y: -4 }}
                >
                  <Card className="border border-border rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all h-full flex flex-col">
                    <CardContent className="p-0 flex-1 flex flex-col">
                      {/* Header with Icon */}
                      <div className="bg-gradient-to-br from-primary/10 to-primary/5 p-6 flex items-center justify-center">
                        <div className="w-20 h-20 rounded-full bg-white shadow-md flex items-center justify-center">
                          <Icon className="w-10 h-10 text-primary" />
                        </div>
                      </div>

                      {/* Content */}
                      <div className="p-5 flex-1 flex flex-col gap-3">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h3 className="font-display font-bold text-lg leading-tight">{item.name}</h3>
                            <Badge variant="secondary" className="mt-1 text-xs">
                              {item.category}
                            </Badge>
                          </div>
                        </div>

                        <p className="text-muted-foreground text-sm leading-relaxed line-clamp-3">
                          {item.description}
                        </p>

                        {/* Stock Level */}
                        <div className="flex items-center gap-2 mt-auto pt-3 border-t border-border">
                          <div className={`w-2.5 h-2.5 rounded-full ${stockConfig.color}`} />
                          <span className="text-xs font-medium text-muted-foreground">
                            {stockConfig.label}
                          </span>
                        </div>

                        {/* Sponsor Button */}
                        {item.canSponsor && (
                          <Button
                            className="w-full rounded-xl h-11 bg-green-600 hover:bg-green-700 mt-3"
                            onClick={() => handleSponsorClick(item)}
                          >
                            <HeartHandshake className="w-4 h-4 mr-2" />
                            Patrocinar por WhatsApp
                            <MessageCircle className="w-3.5 h-3.5 ml-1" />
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        </motion.div>
      </section>

      {/* Bottom CTA */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.5 }}
          className="bg-gradient-to-r from-green-600 to-emerald-600 rounded-3xl p-8 md:p-12 text-center text-white shadow-xl"
        >
          <HeartHandshake className="w-16 h-16 mx-auto mb-6 opacity-90" />
          <h2 className="text-3xl md:text-4xl font-display font-bold mb-4">
            ¿No ves lo que buscas?
          </h2>
          <p className="text-lg md:text-xl text-white/90 mb-8 max-w-2xl mx-auto leading-relaxed">
            También recibimos donaciones en efectivo para comprar lo que más se necesite en cada momento. 
            Escríbenos y te orientaremos sobre las necesidades prioritarias.
          </p>
          <Button 
            size="lg" 
            className="bg-white text-green-600 hover:bg-white/90 rounded-xl text-lg h-14 px-8 shadow-lg"
            onClick={handleGeneralSponsorClick}
          >
            <MessageCircle className="w-5 h-5 mr-2" />
            Consultar por WhatsApp
          </Button>
        </motion.div>
      </section>
    </div>
  );
}

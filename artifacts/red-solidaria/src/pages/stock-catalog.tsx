import { motion } from "framer-motion";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Armchair, 
  Footprints, 
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
  nameKey: string;
  categoryKey: string;
  descKey: string;
  icon: React.ElementType;
  inStock: boolean;
  stockLevel: "high" | "medium" | "low" | "none";
  canSponsor: boolean;
  sponsorMessageKey?: string;
}

// Los valores de texto son claves i18n: los etiquetados se traducen con t() en el render.
const STOCK_ITEMS: StockItem[] = [
  {
    id: 1,
    nameKey: "stockCatalog.item1Name",
    categoryKey: "stockCatalog.item1Category",
    descKey: "stockCatalog.item1Desc",
    icon: Armchair,
    inStock: true,
    stockLevel: "medium",
    canSponsor: true,
    sponsorMessageKey: "stockCatalog.item1Sponsor"
  },
  {
    id: 2,
    nameKey: "stockCatalog.item2Name",
    categoryKey: "stockCatalog.item2Category",
    descKey: "stockCatalog.item2Desc",
    icon: Footprints,
    inStock: true,
    stockLevel: "high",
    canSponsor: true,
    sponsorMessageKey: "stockCatalog.item2Sponsor"
  },
  {
    id: 3,
    nameKey: "stockCatalog.item3Name",
    categoryKey: "stockCatalog.item3Category",
    descKey: "stockCatalog.item3Desc",
    icon: Package,
    inStock: true,
    stockLevel: "medium",
    canSponsor: true,
    sponsorMessageKey: "stockCatalog.item3Sponsor"
  },
  {
    id: 4,
    nameKey: "stockCatalog.item4Name",
    categoryKey: "stockCatalog.item4Category",
    descKey: "stockCatalog.item4Desc",
    icon: Footprints,
    inStock: true,
    stockLevel: "high",
    canSponsor: true,
    sponsorMessageKey: "stockCatalog.item4Sponsor"
  },
  {
    id: 5,
    nameKey: "stockCatalog.item5Name",
    categoryKey: "stockCatalog.item5Category",
    descKey: "stockCatalog.item5Desc",
    icon: Shirt,
    inStock: true,
    stockLevel: "high",
    canSponsor: true,
    sponsorMessageKey: "stockCatalog.item5Sponsor"
  },
  {
    id: 6,
    nameKey: "stockCatalog.item6Name",
    categoryKey: "stockCatalog.item6Category",
    descKey: "stockCatalog.item6Desc",
    icon: Bed,
    inStock: true,
    stockLevel: "low",
    canSponsor: true,
    sponsorMessageKey: "stockCatalog.item6Sponsor"
  },
  {
    id: 7,
    nameKey: "stockCatalog.item7Name",
    categoryKey: "stockCatalog.item7Category",
    descKey: "stockCatalog.item7Desc",
    icon: Flame,
    inStock: true,
    stockLevel: "medium",
    canSponsor: true,
    sponsorMessageKey: "stockCatalog.item7Sponsor"
  },
  {
    id: 8,
    nameKey: "stockCatalog.item8Name",
    categoryKey: "stockCatalog.item8Category",
    descKey: "stockCatalog.item8Desc",
    icon: Utensils,
    inStock: true,
    stockLevel: "low",
    canSponsor: true,
    sponsorMessageKey: "stockCatalog.item8Sponsor"
  },
];

// Los valores de texto son claves i18n: los etiquetados se traducen con t() en el render.
const STOCK_LEVEL_CONFIG = {
  high: { labelKey: "stockCatalog.stockHigh", color: "bg-green-500" },
  medium: { labelKey: "stockCatalog.stockMedium", color: "bg-yellow-500" },
  low: { labelKey: "stockCatalog.stockLow", color: "bg-orange-500" },
  none: { labelKey: "stockCatalog.stockNone", color: "bg-red-500" },
};

const CATEGORY_FILTERS = ["Todos", "Movilidad", "Ortopedia", "Vestimenta", "Equipamiento Médico", "Servicios Básicos", "Equipamiento del Hogar"];

export default function StockCatalog() {
  const { t } = useTranslation();

  const handleSponsorClick = (item: StockItem) => {
    const phoneNumber = "51999999999"; // Reemplazar con el número real de WhatsApp
    const message = encodeURIComponent(
      `${t("stockCatalog.waSponsorIntro", { name: t(item.nameKey) })}

${item.sponsorMessageKey ? t(item.sponsorMessageKey) : t("stockCatalog.waMoreInfo")}

${t("stockCatalog.waThanks")}`
    );
    window.open(`https://wa.me/${phoneNumber}?text=${message}`, "_blank");
  };

  const handleGeneralSponsorClick = () => {
    const phoneNumber = "51999999999"; // Reemplazar con el número real de WhatsApp
    const message = encodeURIComponent(t("stockCatalog.waGeneralSponsor"));
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
              <Package className="w-4 h-4" /> {t("stockCatalog.badge")}
            </div>
            
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-display font-extrabold text-foreground tracking-tight mb-6">
              {t("stockCatalog.titlePrefix")} <span className="text-primary">{t("stockCatalog.titleHighlight")}</span>
            </h1>
            
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-8 leading-relaxed">
              {t("stockCatalog.heroDesc")}
            </p>

            <Button 
              size="lg" 
              className="rounded-xl text-lg h-14 px-8 shadow-xl shadow-green-500/25 hover:-translate-y-1 transition-transform bg-green-600 hover:bg-green-700"
              onClick={handleGeneralSponsorClick}
            >
              <HeartHandshake className="w-5 h-5 mr-2" />
              {t("stockCatalog.sponsorCta")}
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
          className="bg-card border border-border rounded-2xl p-6 shadow-lg"
        >
          <div className="flex items-start gap-4">
            <div className="p-3 bg-blue-50 rounded-xl">
              <Info className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h3 className="font-display font-bold text-lg mb-2">{t("stockCatalog.infoTitle")}</h3>
              <p className="text-muted-foreground leading-relaxed">
                {t("stockCatalog.infoDesc")}
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
              <h2 className="text-3xl font-display font-bold mb-2">{t("stockCatalog.productsTitle")}</h2>
              <p className="text-muted-foreground">{t("stockCatalog.productsSubtitle")}</p>
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
                        <div className="w-20 h-20 rounded-full bg-card shadow-md flex items-center justify-center">
                          <Icon className="w-10 h-10 text-primary" />
                        </div>
                      </div>

                      {/* Content */}
                      <div className="p-5 flex-1 flex flex-col gap-3">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h3 className="font-display font-bold text-lg leading-tight">{t(item.nameKey)}</h3>
                            <Badge variant="secondary" className="mt-1 text-xs">
                              {t(item.categoryKey)}
                            </Badge>
                          </div>
                        </div>

                        <p className="text-muted-foreground text-sm leading-relaxed line-clamp-3">
                          {t(item.descKey)}
                        </p>

                        {/* Stock Level */}
                        <div className="flex items-center gap-2 mt-auto pt-3 border-t border-border">
                          <div className={`w-2.5 h-2.5 rounded-full ${stockConfig.color}`} />
                          <span className="text-xs font-medium text-muted-foreground">
                            {t(stockConfig.labelKey)}
                          </span>
                        </div>

                        {/* Sponsor Button */}
                        {item.canSponsor && (
                          <Button
                            className="w-full rounded-xl h-11 bg-green-600 hover:bg-green-700 mt-3"
                            onClick={() => handleSponsorClick(item)}
                          >
                            <HeartHandshake className="w-4 h-4 mr-2" />
                            {t("stockCatalog.sponsorWhatsApp")}
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
            {t("stockCatalog.bottomCtaTitle")}
          </h2>
          <p className="text-lg md:text-xl text-white/90 mb-8 max-w-2xl mx-auto leading-relaxed">
            {t("stockCatalog.bottomCtaDesc")}
          </p>
          <Button 
            size="lg" 
            className="bg-card text-green-700 hover:bg-card/90 rounded-xl text-lg h-14 px-8 shadow-lg"
            onClick={handleGeneralSponsorClick}
          >
            <MessageCircle className="w-5 h-5 mr-2" />
            {t("stockCatalog.consultWhatsApp")}
          </Button>
        </motion.div>
      </section>
    </div>
  );
}

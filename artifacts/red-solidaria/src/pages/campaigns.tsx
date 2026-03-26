import { useState } from "react";
import { useGetCampaigns } from "@workspace/api-client-react";
import { CampaignCard } from "@/components/shared/CampaignCard";
import { Button } from "@/components/ui/button";
import SEO from "@/components/shared/SEO";

export default function Campaigns() {
  const [filter, setFilter] = useState<"all" | "active" | "completed">("all");
  
  // Using generated hook from Orval
  const { data: campaigns, isLoading } = useGetCampaigns({ status: filter === "all" ? undefined : filter });

  return (
    <div className="min-h-screen pt-20 bg-background">
      <SEO
        title="Campañas Solidarias"
        description="Conoce y apoya nuestras campañas activas. Cada donación transforma vidas en San Ramón, Chanchamayo, Perú."
        url="/campanas"
      />
      <section className="py-12 bg-secondary/30 border-b border-border/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl md:text-5xl font-display font-bold mb-6">Nuestras Campañas</h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Explora las iniciativas donde tu ayuda hace la diferencia. Cada aporte nos acerca a la meta.
          </p>
          
          <div className="flex flex-wrap justify-center gap-3 mt-10">
            <Button 
              variant={filter === "all" ? "default" : "outline"}
              onClick={() => setFilter("all")}
              className="rounded-full px-6"
            >
              Todas
            </Button>
            <Button 
              variant={filter === "active" ? "default" : "outline"}
              onClick={() => setFilter("active")}
              className="rounded-full px-6"
            >
              En Curso
            </Button>
            <Button 
              variant={filter === "completed" ? "default" : "outline"}
              onClick={() => setFilter("completed")}
              className="rounded-full px-6"
            >
              Finalizadas
            </Button>
          </div>
        </div>
      </section>

      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {[1,2,3,4,5,6].map(i => (
                <div key={i} className="h-96 bg-muted animate-pulse rounded-2xl" />
              ))}
            </div>
          ) : campaigns && campaigns.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {campaigns.map(campaign => (
                <CampaignCard key={campaign.id} campaign={campaign} />
              ))}
            </div>
          ) : (
            <div className="text-center py-20">
              <h3 className="text-2xl font-bold mb-2">No se encontraron campañas</h3>
              <p className="text-muted-foreground">Intenta con otro filtro de búsqueda.</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

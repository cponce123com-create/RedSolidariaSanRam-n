import { useParams } from "wouter";
import { useGetCampaign } from "@workspace/api-client-react";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Heart, Share2, Calendar, Target, TrendingUp } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

export default function CampaignDetail() {
  const { id } = useParams();
  const { data: campaign, isLoading, isError } = useGetCampaign(Number(id));

  if (isLoading) {
    return <div className="min-h-screen pt-32 text-center text-muted-foreground">Cargando campaña...</div>;
  }

  if (isError || !campaign) {
    return <div className="min-h-screen pt-32 text-center text-destructive">Campaña no encontrada.</div>;
  }

  const progress = Math.min(100, Math.round((campaign.raised / campaign.goal) * 100)) || 0;

  return (
    <div className="min-h-screen pt-20 bg-background pb-20">
      {/* Header Image */}
      <div className="w-full h-[40vh] md:h-[50vh] relative">
        <img 
          src={campaign.imageUrl || `https://images.unsplash.com/photo-1488521787991-ed7bbaae773c?w=1600&q=80`} 
          alt={campaign.title}
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/20 to-transparent" />
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 -mt-32 relative z-10">
        <div className="bg-card rounded-3xl shadow-xl border border-border p-6 md:p-10">
          
          <div className="flex flex-wrap gap-3 mb-6">
            <Badge className={campaign.status === 'active' ? "bg-accent" : "bg-secondary text-foreground"}>
              {campaign.status === 'active' ? 'Campaña Activa' : 'Campaña Finalizada'}
            </Badge>
            <Badge variant="outline" className="text-primary border-primary/30 bg-primary/5">
              {campaign.category}
            </Badge>
          </div>

          <h1 className="text-3xl md:text-5xl font-display font-bold mb-6 text-foreground leading-tight">
            {campaign.title}
          </h1>

          <div className="grid md:grid-cols-3 gap-10">
            {/* Main Content */}
            <div className="md:col-span-2 space-y-8">
              <div className="prose prose-lg dark:prose-invert max-w-none text-muted-foreground whitespace-pre-wrap">
                {campaign.description}
              </div>
              
              {/* Fake bank details for demo since they are an NGO */}
              {campaign.status === 'active' && (
                <div className="bg-secondary/50 rounded-2xl p-6 border border-border">
                  <h3 className="font-display font-bold text-xl mb-4 flex items-center gap-2">
                    <Heart className="text-primary w-5 h-5" /> Cuentas para Donación
                  </h3>
                  <div className="space-y-3 text-sm md:text-base">
                    <p><strong>BCP:</strong> 123-4567890-1-23 (Red Solidaria)</p>
                    <p><strong>Yape/Plin:</strong> 987 654 321 (Juan Pérez - Tesorero)</p>
                    <p className="text-muted-foreground mt-4 text-sm">
                      Por favor, envía el voucher de tu donación a nuestro WhatsApp para registrarlo en nuestro portal de transparencia.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Sidebar Stats */}
            <div className="space-y-6">
              <div className="bg-background rounded-2xl p-6 border border-border shadow-sm">
                <div className="mb-6">
                  <div className="flex justify-between items-end mb-2">
                    <span className="text-3xl font-display font-bold text-foreground">S/ {campaign.raised.toLocaleString()}</span>
                  </div>
                  <div className="text-muted-foreground flex justify-between text-sm mb-4">
                    <span>Recaudado</span>
                    <span>Meta: S/ {campaign.goal.toLocaleString()}</span>
                  </div>
                  <Progress value={progress} className="h-3 mb-2" />
                  <div className="text-right text-sm font-semibold text-primary">{progress}%</div>
                </div>

                <div className="space-y-4 mb-8">
                  <div className="flex items-center gap-3 text-sm text-muted-foreground">
                    <Calendar className="w-4 h-4 text-primary" />
                    <span>Inició: {format(new Date(campaign.startDate), "d 'de' MMMM, yyyy", { locale: es })}</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm text-muted-foreground">
                    <Target className="w-4 h-4 text-primary" />
                    <span>Meta: S/ {campaign.goal.toLocaleString()}</span>
                  </div>
                </div>

                <div className="space-y-3">
                  <Button className="w-full rounded-xl h-12 text-lg shadow-md hover-elevate font-semibold" disabled={campaign.status !== 'active'}>
                    <Heart className="w-5 h-5 mr-2" />
                    {campaign.status === 'active' ? 'Donar Ahora' : 'Meta Alcanzada'}
                  </Button>
                  <Button variant="outline" className="w-full rounded-xl h-12">
                    <Share2 className="w-4 h-4 mr-2" />
                    Compartir Campaña
                  </Button>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

import { useState } from "react";
import { useParams } from "wouter";
import { 
  useGetCampaign, 
  useGetCampaignUpdates, 
  useGetCampaignImages,
  useGetDonationStats
} from "@workspace/api-client-react";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Heart, Share2, Calendar, Target, Users, Landmark, Clock, ImageIcon, Copy } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { DonationModal } from "@/components/shared/DonationModal";
import { useToast } from "@/hooks/use-toast";

export default function CampaignDetail() {
  const { id } = useParams();
  const campaignId = Number(id);
  const { toast } = useToast();
  
  const [isDonationModalOpen, setIsDonationModalOpen] = useState(false);
  const [selectedImage, setSelectedImage] = useState<{url: string, caption?: string} | null>(null);

  const { data: campaign, isLoading: loadingCampaign, isError } = useGetCampaign(campaignId);
  const { data: updates, isLoading: loadingUpdates } = useGetCampaignUpdates(campaignId);
  const { data: images, isLoading: loadingImages } = useGetCampaignImages(campaignId);

  if (loadingCampaign) {
    return <div className="min-h-screen pt-32 text-center text-muted-foreground flex flex-col items-center"><div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mb-4"></div>Cargando campaña...</div>;
  }

  if (isError || !campaign) {
    return <div className="min-h-screen pt-32 text-center text-destructive font-bold text-xl">Campaña no encontrada.</div>;
  }

  const progress = Math.min(100, Math.round((campaign.raised / campaign.goal) * 100)) || 0;

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: campaign.title,
          text: `Apoya la campaña: ${campaign.title}`,
          url: window.location.href,
        });
      } catch (err) {
        console.log("Error sharing", err);
      }
    } else {
      navigator.clipboard.writeText(window.location.href);
      toast({ title: "Enlace copiado", description: "El enlace de la campaña ha sido copiado al portapapeles." });
    }
  };

  return (
    <div className="min-h-screen pt-20 bg-background pb-20">
      <DonationModal 
        open={isDonationModalOpen} 
        onClose={() => setIsDonationModalOpen(false)} 
        campaignId={campaign.id}
        campaignTitle={campaign.title}
      />

      {/* Lightbox for Gallery */}
      <Dialog open={!!selectedImage} onOpenChange={() => setSelectedImage(null)}>
        <DialogContent className="max-w-4xl bg-transparent border-none shadow-none p-0 overflow-hidden group">
          {selectedImage && (
            <div className="relative rounded-2xl overflow-hidden bg-black/90">
              <img src={selectedImage.url} alt="Gallery view" className="w-full max-h-[80vh] object-contain" />
              {selectedImage.caption && (
                <div className="absolute bottom-0 inset-x-0 bg-black/60 text-white p-4 text-center backdrop-blur-sm">
                  {selectedImage.caption}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Hero Banner */}
      <div className="w-full h-[40vh] md:h-[55vh] relative">
        {/* Landing page hero scenic mountain landscape */}
        <img 
          src={campaign.imageUrl || `https://images.unsplash.com/photo-1488521787991-ed7bbaae773c?w=1600&q=80`} 
          alt={campaign.title}
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-black/30" />
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 -mt-32 relative z-10">
        <div className="bg-card rounded-3xl shadow-xl border border-border p-6 md:p-10 mb-10">
          
          <div className="flex flex-wrap gap-3 mb-6">
            <Badge className={`px-4 py-1 text-sm ${campaign.status === 'active' ? "bg-accent hover:bg-accent/90" : campaign.status === 'paused' ? "bg-yellow-500 hover:bg-yellow-600" : "bg-secondary text-foreground hover:bg-secondary/80"}`}>
              {campaign.status === 'active' ? 'Campaña Activa' : campaign.status === 'paused' ? 'Pausada' : 'Finalizada'}
            </Badge>
            <Badge variant="outline" className="px-4 py-1 text-sm text-primary border-primary/30 bg-primary/5">
              {campaign.category}
            </Badge>
            {campaign.featured && (
              <Badge variant="outline" className="px-4 py-1 text-sm text-yellow-600 border-yellow-300 bg-yellow-50">
                ⭐ Destacada
              </Badge>
            )}
          </div>

          <h1 className="text-3xl md:text-5xl lg:text-6xl font-display font-bold mb-8 text-foreground leading-tight" data-testid="campaign-detail-title">
            {campaign.title}
          </h1>

          <div className="grid lg:grid-cols-3 gap-12">
            
            {/* Main Content Column */}
            <div className="lg:col-span-2 space-y-12">
              
              <section>
                <h2 className="text-2xl font-display font-bold mb-4 border-b border-border pb-2">Acerca de la campaña</h2>
                <div className="prose prose-lg dark:prose-invert max-w-none text-muted-foreground whitespace-pre-wrap leading-relaxed">
                  {campaign.description}
                </div>
              </section>

              {/* Gallery Section */}
              <section>
                <h2 className="text-2xl font-display font-bold mb-4 border-b border-border pb-2 flex items-center gap-2">
                  <ImageIcon className="w-5 h-5 text-primary" /> Galería de Imágenes
                </h2>
                {loadingImages ? (
                  <div className="h-32 flex items-center justify-center text-muted-foreground">Cargando galería...</div>
                ) : images && images.length > 0 ? (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {images.map(img => (
                      <div 
                        key={img.id} 
                        className="aspect-square rounded-2xl overflow-hidden cursor-pointer group relative border border-border shadow-sm"
                        onClick={() => setSelectedImage({ url: img.imageUrl, caption: img.caption || undefined })}
                      >
                        <img src={img.imageUrl} alt={img.caption || "Gallery image"} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="bg-secondary/30 rounded-2xl p-8 text-center border border-dashed border-border text-muted-foreground">
                    Sin galería aún
                  </div>
                )}
              </section>

              {/* Updates Section */}
              <section>
                <h2 className="text-2xl font-display font-bold mb-6 border-b border-border pb-2 flex items-center gap-2">
                  <Clock className="w-5 h-5 text-primary" /> Actualizaciones
                </h2>
                {loadingUpdates ? (
                  <div className="h-32 flex items-center justify-center text-muted-foreground">Cargando actualizaciones...</div>
                ) : updates && updates.length > 0 ? (
                  <div className="space-y-6 pl-2">
                    {updates.map((update, idx) => (
                      <div key={update.id} className="relative pl-8 before:absolute before:left-[11px] before:top-2 before:bottom-[-24px] before:w-[2px] before:bg-primary/20 last:before:hidden">
                        <div className="absolute left-0 top-2 w-6 h-6 rounded-full bg-primary/10 border-2 border-primary flex items-center justify-center">
                          <div className="w-2 h-2 rounded-full bg-primary" />
                        </div>
                        <div className="bg-card border border-border rounded-2xl p-5 shadow-sm">
                          <div className="text-sm font-medium text-primary mb-1">
                            {format(new Date(update.createdAt), "d 'de' MMMM, yyyy", { locale: es })}
                          </div>
                          <h3 className="text-lg font-bold text-foreground mb-2">{update.title}</h3>
                          <p className="text-muted-foreground whitespace-pre-wrap">{update.content}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="bg-secondary/30 rounded-2xl p-8 text-center border border-dashed border-border text-muted-foreground">
                    Sin actualizaciones aún
                  </div>
                )}
              </section>

              {/* Payment Info Box (Fallback if not using modal) */}
              {campaign.status === 'active' && (
                <section className="bg-primary/5 rounded-3xl p-8 border border-primary/20">
                  <h3 className="font-display font-bold text-2xl mb-4 flex items-center gap-3 text-foreground">
                    <Landmark className="text-primary w-6 h-6" /> Otras formas de ayudar
                  </h3>
                  <div className="space-y-4 text-base text-muted-foreground">
                    <p>Si prefieres hacer una transferencia directa, puedes usar nuestras cuentas oficiales. Por favor, asegúrate de enviar el voucher al WhatsApp para registrarlo en esta campaña.</p>
                    <div className="grid sm:grid-cols-2 gap-4 mt-4">
                      <div className="bg-white dark:bg-black rounded-xl p-4 border border-border shadow-sm">
                        <div className="font-bold text-foreground mb-1">Cta. BCP (Soles)</div>
                        <div className="font-mono text-lg flex items-center justify-between">
                          193-12345678-0-55
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={() => navigator.clipboard.writeText("193-12345678-0-55")}><Copy className="w-4 h-4"/></Button>
                        </div>
                        <div className="text-sm text-muted-foreground mt-1">CCI: 00219312345678055</div>
                      </div>
                      <div className="bg-white dark:bg-black rounded-xl p-4 border border-border shadow-sm">
                        <div className="font-bold text-foreground mb-1">Yape / Plin</div>
                        <div className="font-mono text-lg flex items-center justify-between">
                          987 654 321
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={() => navigator.clipboard.writeText("987654321")}><Copy className="w-4 h-4"/></Button>
                        </div>
                        <div className="text-sm text-muted-foreground mt-1">Titular: Juan Pérez (Red Solidaria)</div>
                      </div>
                    </div>
                  </div>
                </section>
              )}
            </div>

            {/* Sidebar Column */}
            <div className="lg:col-span-1">
              <div className="sticky top-28 space-y-6">
                <div className="bg-card rounded-3xl p-6 md:p-8 border border-border shadow-lg shadow-primary/5">
                  <div className="mb-8">
                    <div className="flex justify-between items-end mb-2">
                      <span className="text-4xl font-display font-extrabold text-foreground" data-testid="campaign-raise-amount">
                        S/ {campaign.raised.toLocaleString()}
                      </span>
                    </div>
                    <div className="text-muted-foreground flex justify-between text-sm mb-4 font-medium">
                      <span>Recaudado</span>
                      <span>Meta: S/ {campaign.goal.toLocaleString()}</span>
                    </div>
                    <Progress value={progress} className="h-4 mb-3" data-testid="campaign-progress-bar" />
                    <div className="flex justify-between items-center">
                      <div className="text-xl font-bold text-primary">{progress}% alcanzado</div>
                      <div className="flex items-center gap-1.5 text-muted-foreground text-sm font-medium">
                        <Users className="w-4 h-4" /> {campaign.donorCount} donantes
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4 mb-8 bg-secondary/50 rounded-2xl p-4 border border-border/50">
                    <div className="flex items-center gap-3 text-sm text-muted-foreground">
                      <div className="w-8 h-8 rounded-full bg-background flex items-center justify-center shadow-sm">
                        <Calendar className="w-4 h-4 text-primary" />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-xs">Fecha de Inicio</span>
                        <span className="font-semibold text-foreground">{format(new Date(campaign.startDate), "d MMM yyyy", { locale: es })}</span>
                      </div>
                    </div>
                    {campaign.endDate && (
                      <div className="flex items-center gap-3 text-sm text-muted-foreground">
                        <div className="w-8 h-8 rounded-full bg-background flex items-center justify-center shadow-sm">
                          <Target className="w-4 h-4 text-primary" />
                        </div>
                        <div className="flex flex-col">
                          <span className="text-xs">Fecha de Cierre</span>
                          <span className="font-semibold text-foreground">{format(new Date(campaign.endDate), "d MMM yyyy", { locale: es })}</span>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="space-y-3">
                    <Button 
                      className="w-full rounded-2xl h-14 text-lg shadow-xl shadow-primary/20 hover-elevate font-bold transition-all" 
                      disabled={campaign.status !== 'active'}
                      onClick={() => setIsDonationModalOpen(true)}
                      data-testid="btn-donate-now"
                    >
                      <Heart className="w-6 h-6 mr-2 fill-current" />
                      {campaign.status === 'active' ? 'Donar Ahora' : 'Campaña Cerrada'}
                    </Button>
                    <Button 
                      variant="outline" 
                      className="w-full rounded-2xl h-12 font-semibold hover:bg-secondary border-2"
                      onClick={handleShare}
                      data-testid="btn-share-campaign"
                    >
                      <Share2 className="w-5 h-5 mr-2 text-primary" />
                      Compartir Campaña
                    </Button>
                  </div>
                </div>
                
                <div className="bg-card rounded-3xl p-6 border border-border text-center">
                  <Heart className="w-8 h-8 text-primary mx-auto mb-3 opacity-50" />
                  <h4 className="font-display font-bold text-lg mb-2">Transparencia Total</h4>
                  <p className="text-sm text-muted-foreground">
                    Cada donación cuenta. Publicamos el registro detallado de ingresos y gastos al finalizar cada campaña.
                  </p>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

import { useState } from "react";
import { useParams, Link } from "wouter";
import { 
  useGetCampaign, 
  useGetCampaignUpdates, 
  useGetCampaignImages,
  useGetCampaignDonors,
} from "@workspace/api-client-react";
import { useCampaignTransparency } from "@/hooks/use-phase3";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Heart, Share2, Calendar, Target, Users, Landmark, Clock, ImageIcon, Copy, Shield, ArrowRight, Eye } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { DonationModal } from "@/components/shared/DonationModal";
import { useToast } from "@/hooks/use-toast";
import SEO from "@/components/shared/SEO";
import ShareButtons from "@/components/shared/ShareButtons";

export default function CampaignDetail() {
  const { id } = useParams();
  const campaignId = Number(id);
  const { toast } = useToast();
  
  const [isDonationModalOpen, setIsDonationModalOpen] = useState(false);
  const [selectedImage, setSelectedImage] = useState<{url: string, caption?: string} | null>(null);
  const [selectedProof, setSelectedProof] = useState<string | null>(null);

  const { data: campaign, isLoading: loadingCampaign, isError } = useGetCampaign(campaignId);
  const { data: updates, isLoading: loadingUpdates } = useGetCampaignUpdates(campaignId);
  const { data: images, isLoading: loadingImages } = useGetCampaignImages(campaignId);
  const { data: donors } = useGetCampaignDonors(campaignId);
  
  // Phase 3 Transparency summary
  const { data: transparency } = useCampaignTransparency(campaignId);

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

  const hasTransparencyData = transparency && (transparency.publicExpenseCount > 0 || transparency.publicEvidenceCount > 0 || transparency.totalRaised > 0);

  return (
    <div className="min-h-screen pt-20 bg-background pb-20">
      <SEO
        title={campaign.title}
        description={campaign.description || `Apoya la campaña "${campaign.title}" de Red Solidaria San Ramón. Tu donación hace la diferencia.`}
        url={`/campanas/${campaign.id}`}
        type="article"
        image={campaign.imageUrl || undefined}
      />
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

              {/* Payment Info Box */}
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
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary transition-colors" onClick={() => navigator.clipboard.writeText("193-12345678-0-55")}><Copy className="w-4 h-4"/></Button>
                        </div>
                        <div className="text-sm text-muted-foreground mt-1">CCI: 00219312345678055</div>
                      </div>
                      <div className="bg-white dark:bg-black rounded-xl p-4 border border-border shadow-sm">
                        <div className="font-bold text-foreground mb-1">Yape / Plin</div>
                        <div className="font-mono text-lg flex items-center justify-between">
                          921 615 737
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary transition-colors" onClick={() => navigator.clipboard.writeText("987654321")}><Copy className="w-4 h-4"/></Button>
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
                        S/ {campaign.raised.toLocaleString("es-PE", {minimumFractionDigits: 0})}
                      </span>
                    </div>
                    <div className="text-muted-foreground flex justify-between text-sm mb-4 font-medium">
                      <span>Recaudado</span>
                      <span>Meta: S/ {campaign.goal.toLocaleString("es-PE", {minimumFractionDigits: 0})}</span>
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
                    <div className="space-y-2" data-testid="share-buttons-campaign">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Compartir campaña</p>
                      <ShareButtons
                        title={campaign.title}
                        description={`Apoya esta campaña solidaria en San Ramón, Chanchamayo.`}
                        className="flex-wrap"
                      />
                    </div>
                  </div>
                </div>
                
                {/* Phase 3 Transparency Callout Sidebar */}
                <div className="bg-gradient-to-br from-green-50 to-green-100/50 dark:from-green-950/20 dark:to-green-900/10 rounded-3xl p-6 border-2 border-green-200 dark:border-green-800/50 shadow-sm relative overflow-hidden group">
                  <div className="absolute -right-4 -top-4 w-24 h-24 bg-green-200/50 dark:bg-green-800/30 rounded-full blur-xl group-hover:scale-150 transition-transform duration-500"></div>
                  
                  <div className="flex items-center gap-2 mb-3 relative z-10">
                    <Shield className="w-6 h-6 text-green-600 dark:text-green-400" />
                    <h4 className="font-display font-bold text-lg text-green-900 dark:text-green-300">100% Transparente</h4>
                  </div>
                  
                  <p className="text-sm text-green-800/80 dark:text-green-300/80 font-medium mb-5 relative z-10 leading-relaxed">
                    Esta campaña rinde cuentas públicamente. Publicamos los gastos y evidencias de impacto para tu total tranquilidad.
                  </p>
                  
                  <Link href={`/campanas/${campaignId}/transparencia`} className="block relative z-10">
                    <Button variant="default" className="w-full bg-green-600 hover:bg-green-700 text-white rounded-xl font-bold shadow-md hover-elevate">
                      Ver Rendición de Cuentas <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                  </Link>
                </div>

              </div>
            </div>
          </div>

          {/* Phase 3 Full Width Transparency Banner (Bottom) */}
          {hasTransparencyData && (
            <div className="mt-16 pt-12 border-t border-border">
              <div className="bg-white dark:bg-card border-2 border-border shadow-lg rounded-3xl p-8 md:p-10 flex flex-col md:flex-row items-center justify-between gap-8 relative overflow-hidden group hover:border-green-300/50 transition-colors">
                <div className="absolute top-0 right-0 w-64 h-64 bg-green-50/50 rounded-full blur-3xl -z-10 group-hover:bg-green-100/50 transition-colors"></div>
                
                <div className="flex-1 text-center md:text-left z-10">
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-bold uppercase tracking-wider mb-4 border border-green-200">
                    <Shield className="w-3.5 h-3.5" /> Rendición Pública
                  </div>
                  <h3 className="text-2xl md:text-3xl font-display font-bold mb-3 text-foreground">
                    Tu confianza es nuestra prioridad
                  </h3>
                  <p className="text-muted-foreground text-lg mb-6 max-w-2xl">
                    Revisa en detalle cómo se están utilizando los fondos recaudados en esta campaña. Publicamos todos los gastos, boletas y fotos de las actividades.
                  </p>
                  
                  <div className="flex flex-wrap gap-4 justify-center md:justify-start mb-6 md:mb-0">
                    <div className="bg-secondary/50 px-4 py-2 rounded-xl border border-border/50">
                      <div className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-1">Recaudado</div>
                      <div className="font-bold text-foreground">S/ {transparency.totalRaised.toLocaleString("es-PE")}</div>
                    </div>
                    <div className="bg-secondary/50 px-4 py-2 rounded-xl border border-border/50">
                      <div className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-1">Gastado</div>
                      <div className="font-bold text-foreground">S/ {transparency.publicSpent.toLocaleString("es-PE")}</div>
                    </div>
                    <div className="bg-primary/5 px-4 py-2 rounded-xl border border-primary/20">
                      <div className="text-xs text-primary uppercase tracking-wider font-semibold mb-1">Saldo</div>
                      <div className="font-bold text-primary">S/ {transparency.balance.toLocaleString("es-PE")}</div>
                    </div>
                  </div>
                </div>

                <div className="flex-shrink-0 z-10">
                  <Link href={`/campanas/${campaignId}/transparencia`}>
                    <Button className="h-14 px-8 rounded-2xl text-lg font-bold shadow-xl shadow-primary/20 hover-elevate group-hover:bg-green-600 transition-colors">
                      Ver Panel de Transparencia
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          )}

          {/* Donantes de la campaña */}
          <div className="mt-16 pt-12 border-t border-border">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h2 className="text-3xl font-display font-bold flex items-center gap-3 text-foreground mb-2">
                  <Users className="w-8 h-8 text-primary" /> Donantes
                </h2>
                <p className="text-muted-foreground font-medium">Personas que ya confiaron en esta campaña. ¡Gracias por su solidaridad!</p>
              </div>
              {donors && donors.length > 0 && (
                <Badge variant="secondary" className="px-4 py-1.5 text-sm">{donors.length} donantes</Badge>
              )}
            </div>

            {donors && donors.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {donors.map((donor) => (
                  <div key={donor.id} className="bg-white dark:bg-card rounded-3xl border border-border shadow-sm p-5 flex flex-col gap-3 hover-elevate transition-all">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
                          <Heart className="w-5 h-5 fill-current" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold text-foreground truncate">{donor.name || "Anónimo"}</p>
                          <p className="text-xs text-muted-foreground">{format(new Date(donor.date), "dd MMM yyyy", { locale: es })}</p>
                        </div>
                      </div>
                      <span className="font-bold text-primary whitespace-nowrap">S/ {donor.amount.toLocaleString("es-PE")}</span>
                    </div>
                    {donor.message && <p className="text-sm text-muted-foreground line-clamp-2">"{donor.message}"</p>}
                    {donor.publicProof && donor.proofUrl && (
                      <Button type="button" variant="outline" size="sm" className="w-full rounded-xl text-xs" onClick={() => setSelectedProof(donor.proofUrl ?? null)}>
                        <Eye className="w-4 h-4 mr-1" /> Ver comprobante
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-white dark:bg-card rounded-3xl border border-dashed border-border p-12 text-center shadow-sm">
                <Users className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
                <h3 className="text-xl font-bold text-foreground mb-2">Sé el primero en donar</h3>
                <p className="text-muted-foreground">Tu apoyo se reflejará aquí una vez validemos tu donación.</p>
              </div>
            )}
          </div>

          {/* Lightbox del comprobante público */}
          <Dialog open={!!selectedProof} onOpenChange={() => setSelectedProof(null)}>
            <DialogContent className="max-w-3xl p-0 overflow-hidden bg-black/95 border-none shadow-2xl rounded-3xl">
              {selectedProof && (
                <img src={selectedProof} alt="Comprobante de donación" className="w-full max-h-[80vh] object-contain" />
              )}
            </DialogContent>
          </Dialog>

        </div>
      </div>
    </div>
  );
}

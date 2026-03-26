import { useState, useEffect } from "react";
import { useParams, Link } from "wouter";
import { 
  useGetCampaign, 
  useUpdateCampaign, 
  useGetCampaignImages, 
  useAddCampaignImage, 
  useDeleteCampaignImage,
  useGetCampaignUpdates,
  useCreateCampaignUpdate,
  useDeleteCampaignUpdate
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { ArrowLeft, Save, Trash2, Image as ImageIcon, MessageSquarePlus, Pause, Play, CheckCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";

const infoSchema = z.object({
  title: z.string().min(3),
  description: z.string().min(10),
  goal: z.coerce.number().min(1),
  raised: z.coerce.number().min(0),
  category: z.string().min(2),
  status: z.enum(["active", "completed", "paused"]),
  featured: z.boolean(),
  startDate: z.string(),
  endDate: z.string().optional().nullable(),
  imageUrl: z.string().optional().nullable(),
});

const imageSchema = z.object({
  imageUrl: z.string().url("Debe ser una URL válida"),
  caption: z.string().optional(),
});

const updateSchema = z.object({
  title: z.string().min(3, "Título requerido"),
  content: z.string().min(10, "Contenido requerido"),
});

export default function AdminCampaignDetail() {
  const { id } = useParams();
  const campaignId = Number(id);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"info"|"gallery"|"updates">("info");

  const { data: campaign, isLoading } = useGetCampaign(campaignId);
  const { data: images } = useGetCampaignImages(campaignId);
  const { data: updates } = useGetCampaignUpdates(campaignId);

  const updateCampaign = useUpdateCampaign();
  const addImage = useAddCampaignImage();
  const deleteImage = useDeleteCampaignImage();
  const addUpdate = useCreateCampaignUpdate();
  const deleteUpdate = useDeleteCampaignUpdate();

  const infoForm = useForm<z.infer<typeof infoSchema>>({
    resolver: zodResolver(infoSchema),
  });

  const imageForm = useForm<z.infer<typeof imageSchema>>({
    resolver: zodResolver(imageSchema),
    defaultValues: { imageUrl: "", caption: "" }
  });

  const updateForm = useForm<z.infer<typeof updateSchema>>({
    resolver: zodResolver(updateSchema),
    defaultValues: { title: "", content: "" }
  });

  useEffect(() => {
    if (campaign) {
      infoForm.reset({
        title: campaign.title,
        description: campaign.description,
        goal: campaign.goal,
        raised: campaign.raised,
        category: campaign.category,
        status: campaign.status,
        featured: campaign.featured,
        startDate: campaign.startDate,
        endDate: campaign.endDate || "",
        imageUrl: campaign.imageUrl || "",
      });
    }
  }, [campaign, infoForm]);

  const onInfoSubmit = (values: z.infer<typeof infoSchema>) => {
    updateCampaign.mutate({ id: campaignId, data: values }, {
      onSuccess: () => {
        toast({ title: "Campaña actualizada" });
        queryClient.invalidateQueries({ queryKey: [`/api/campaigns/${campaignId}`] });
      }
    });
  };

  const handleStatusChange = (newStatus: "active" | "paused" | "completed") => {
    if (!campaign) return;
    updateCampaign.mutate({ 
      id: campaignId, 
      data: { ...infoForm.getValues(), status: newStatus } 
    }, {
      onSuccess: () => {
        toast({ title: `Campaña ${newStatus === 'active' ? 'activada' : newStatus === 'paused' ? 'pausada' : 'finalizada'}` });
        queryClient.invalidateQueries({ queryKey: [`/api/campaigns/${campaignId}`] });
      }
    });
  };

  const onImageSubmit = (values: z.infer<typeof imageSchema>) => {
    addImage.mutate({ id: campaignId, data: values }, {
      onSuccess: () => {
        toast({ title: "Imagen agregada a la galería" });
        imageForm.reset();
        queryClient.invalidateQueries({ queryKey: [`/api/campaigns/${campaignId}/images`] });
      }
    });
  };

  const onUpdateSubmit = (values: z.infer<typeof updateSchema>) => {
    addUpdate.mutate({ id: campaignId, data: values }, {
      onSuccess: () => {
        toast({ title: "Actualización publicada" });
        updateForm.reset();
        queryClient.invalidateQueries({ queryKey: [`/api/campaigns/${campaignId}/updates`] });
      }
    });
  };

  if (isLoading || !campaign) return <div className="p-8">Cargando...</div>;

  return (
    <div className="p-8 max-w-5xl mx-auto" data-testid="admin-campaign-detail">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <Link href="/admin/campanas">
          <Button variant="ghost" size="icon" className="rounded-full"><ArrowLeft className="w-5 h-5"/></Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-display font-bold">{campaign.title}</h1>
            <Badge variant="outline" className={campaign.status === 'active' ? 'bg-accent/10 text-accent border-accent/20' : ''}>
              {campaign.status}
            </Badge>
            {campaign.featured && <Badge className="bg-yellow-500 hover:bg-yellow-600">Destacada</Badge>}
          </div>
          <p className="text-muted-foreground mt-1 text-sm">Gestiona los detalles, galería y novedades de esta campaña.</p>
        </div>
        <div className="flex gap-2">
          {campaign.status !== 'active' && (
            <Button variant="outline" className="rounded-xl border-accent/30 text-accent hover:bg-accent/10" onClick={() => handleStatusChange("active")}>
              <Play className="w-4 h-4 mr-2" /> Activar
            </Button>
          )}
          {campaign.status === 'active' && (
            <Button variant="outline" className="rounded-xl border-yellow-500/30 text-yellow-600 hover:bg-yellow-500/10" onClick={() => handleStatusChange("paused")}>
              <Pause className="w-4 h-4 mr-2" /> Pausar
            </Button>
          )}
          {campaign.status !== 'completed' && (
            <Button variant="outline" className="rounded-xl" onClick={() => handleStatusChange("completed")}>
              <CheckCircle className="w-4 h-4 mr-2" /> Finalizar
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-4 mb-8 border-b border-border">
        {(["info", "gallery", "updates"] as const).map(tab => (
          <button
            key={tab}
            className={`pb-3 px-2 text-sm font-medium transition-colors border-b-2 ${activeTab === tab ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
            onClick={() => setActiveTab(tab)}
            data-testid={`tab-${tab}`}
          >
            {tab === "info" ? "Info General" : tab === "gallery" ? "Galería" : "Actualizaciones"}
          </button>
        ))}
      </div>

      {/* TAB: INFO */}
      {activeTab === "info" && (
        <div className="bg-card border border-border rounded-2xl p-6 md:p-8 shadow-sm">
          <Form {...infoForm}>
            <form onSubmit={infoForm.handleSubmit(onInfoSubmit)} className="space-y-6">
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField control={infoForm.control} name="title" render={({ field }) => (
                  <FormItem><FormLabel>Título de la Campaña</FormLabel><FormControl><Input className="rounded-xl bg-secondary/30" {...field} /></FormControl></FormItem>
                )} />
                <FormField control={infoForm.control} name="category" render={({ field }) => (
                  <FormItem><FormLabel>Categoría</FormLabel><FormControl><Input className="rounded-xl bg-secondary/30" {...field} /></FormControl></FormItem>
                )} />
              </div>

              <FormField control={infoForm.control} name="description" render={({ field }) => (
                <FormItem><FormLabel>Descripción Completa</FormLabel><FormControl><Textarea className="min-h-[150px] rounded-xl bg-secondary/30" {...field} /></FormControl></FormItem>
              )} />

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <FormField control={infoForm.control} name="goal" render={({ field }) => (
                  <FormItem><FormLabel>Meta (S/)</FormLabel><FormControl><Input type="number" className="rounded-xl bg-secondary/30" {...field} /></FormControl></FormItem>
                )} />
                <FormField control={infoForm.control} name="raised" render={({ field }) => (
                  <FormItem><FormLabel>Recaudación Actual (S/)</FormLabel><FormControl><Input type="number" className="rounded-xl bg-secondary/30" {...field} /></FormControl><p className="text-xs text-muted-foreground">Normalmente se actualiza automático por donaciones.</p></FormItem>
                )} />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField control={infoForm.control} name="startDate" render={({ field }) => (
                  <FormItem><FormLabel>Fecha de Inicio</FormLabel><FormControl><Input type="date" className="rounded-xl bg-secondary/30" {...field} /></FormControl></FormItem>
                )} />
                <FormField control={infoForm.control} name="endDate" render={({ field }) => (
                  <FormItem><FormLabel>Fecha de Cierre (Opcional)</FormLabel><FormControl><Input type="date" className="rounded-xl bg-secondary/30" value={field.value || ""} onChange={field.onChange} /></FormControl></FormItem>
                )} />
              </div>

              <FormField control={infoForm.control} name="imageUrl" render={({ field }) => (
                <FormItem><FormLabel>URL de Imagen de Portada</FormLabel><FormControl><Input className="rounded-xl bg-secondary/30" value={field.value || ""} onChange={field.onChange} placeholder="https://..."/></FormControl></FormItem>
              )} />

              <div className="pt-4 border-t border-border flex justify-end">
                <Button type="submit" className="h-12 px-8 rounded-xl text-lg shadow-md hover-elevate" disabled={updateCampaign.isPending} data-testid="btn-save-campaign">
                  <Save className="w-5 h-5 mr-2" /> Guardar Cambios
                </Button>
              </div>

            </form>
          </Form>
        </div>
      )}

      {/* TAB: GALLERY */}
      {activeTab === "gallery" && (
        <div className="space-y-8">
          <div className="bg-primary/5 border border-primary/20 rounded-2xl p-6">
            <h3 className="font-semibold mb-4 flex items-center gap-2"><ImageIcon className="w-5 h-5 text-primary"/> Agregar nueva imagen</h3>
            <Form {...imageForm}>
              <form onSubmit={imageForm.handleSubmit(onImageSubmit)} className="flex gap-4 items-end">
                <FormField control={imageForm.control} name="imageUrl" render={({ field }) => (
                  <FormItem className="flex-1"><FormLabel>URL de la imagen</FormLabel><FormControl><Input placeholder="https://..." className="rounded-xl bg-background" {...field} /></FormControl><FormMessage/></FormItem>
                )} />
                <FormField control={imageForm.control} name="caption" render={({ field }) => (
                  <FormItem className="flex-1"><FormLabel>Descripción (Pie de foto)</FormLabel><FormControl><Input placeholder="Opcional" className="rounded-xl bg-background" {...field} /></FormControl></FormItem>
                )} />
                <Button type="submit" className="rounded-xl h-10" disabled={addImage.isPending} data-testid="btn-add-image">Agregar Imagen</Button>
              </form>
            </Form>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {images?.map(img => (
              <div key={img.id} className="group relative rounded-2xl overflow-hidden border border-border shadow-sm aspect-square bg-secondary">
                <img src={img.imageUrl} alt={img.caption || ""} className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-between p-3">
                  <div className="flex justify-end">
                    <Button variant="destructive" size="icon" className="w-8 h-8 rounded-lg" onClick={() => deleteImage.mutate({ id: campaignId, imageId: img.id }, { onSuccess: () => queryClient.invalidateQueries({ queryKey: [`/api/campaigns/${campaignId}/images`] })})}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                  {img.caption && <p className="text-white text-xs text-center truncate">{img.caption}</p>}
                </div>
              </div>
            ))}
            {images?.length === 0 && <div className="col-span-full py-12 text-center text-muted-foreground border-2 border-dashed border-border rounded-2xl">La galería está vacía.</div>}
          </div>
        </div>
      )}

      {/* TAB: UPDATES */}
      {activeTab === "updates" && (
        <div className="grid md:grid-cols-3 gap-8">
          <div className="md:col-span-1">
            <div className="bg-card border border-border rounded-2xl p-6 sticky top-8 shadow-sm">
              <h3 className="font-semibold mb-4 flex items-center gap-2"><MessageSquarePlus className="w-5 h-5 text-primary"/> Nueva Actualización</h3>
              <Form {...updateForm}>
                <form onSubmit={updateForm.handleSubmit(onUpdateSubmit)} className="space-y-4">
                  <FormField control={updateForm.control} name="title" render={({ field }) => (
                    <FormItem><FormLabel>Título</FormLabel><FormControl><Input className="rounded-xl bg-secondary/30" {...field} /></FormControl><FormMessage/></FormItem>
                  )} />
                  <FormField control={updateForm.control} name="content" render={({ field }) => (
                    <FormItem><FormLabel>Contenido</FormLabel><FormControl><Textarea className="min-h-[120px] rounded-xl bg-secondary/30" {...field} /></FormControl><FormMessage/></FormItem>
                  )} />
                  <Button type="submit" className="w-full rounded-xl" disabled={addUpdate.isPending} data-testid="btn-add-update">Publicar Actualización</Button>
                </form>
              </Form>
            </div>
          </div>

          <div className="md:col-span-2 space-y-4">
            {updates?.map(update => (
              <div key={update.id} className="bg-card border border-border rounded-2xl p-5 shadow-sm">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <div className="text-xs text-primary font-medium mb-1">{format(new Date(update.createdAt), "dd/MM/yyyy HH:mm")}</div>
                    <h4 className="font-bold text-lg">{update.title}</h4>
                  </div>
                  <Button variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10 -mt-2 -mr-2" onClick={() => deleteUpdate.mutate({ id: campaignId, updateId: update.id }, { onSuccess: () => queryClient.invalidateQueries({ queryKey: [`/api/campaigns/${campaignId}/updates`] })})}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
                <p className="text-muted-foreground whitespace-pre-wrap text-sm">{update.content}</p>
              </div>
            ))}
            {updates?.length === 0 && <div className="py-12 text-center text-muted-foreground border-2 border-dashed border-border rounded-2xl">No hay actualizaciones publicadas.</div>}
          </div>
        </div>
      )}

    </div>
  );
}

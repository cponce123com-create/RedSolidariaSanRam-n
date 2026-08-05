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
import { 
  useCampaignExpenses, 
  useCreateExpense, 
  useUpdateExpense, 
  useDeleteExpense,
  useCampaignEvidence,
  useCreateEvidence,
  useUpdateEvidence,
  useDeleteEvidence
} from "@/hooks/use-phase3";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ImageUploadField } from "@/components/shared/ImageUploadField";
import { Badge } from "@/components/ui/badge";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { 
  ArrowLeft, Save, Trash2, Image as ImageIcon, MessageSquarePlus, 
  Pause, Play, CheckCircle, Receipt, Camera, Eye, EyeOff, ShieldAlert,
  FileText
} from "lucide-react";
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

const expenseSchema = z.object({
  description: z.string().min(3, "Descripción requerida"),
  category: z.string().min(2),
  amount: z.coerce.number().min(0.1, "El monto debe ser mayor a 0"),
  date: z.string().min(10),
  responsible: z.string().optional(),
  observations: z.string().optional(),
  receiptUrl: z.string().optional(),
  receiptType: z.string().optional(),
  isPublic: z.boolean().default(true),
});

const evidenceSchema = z.object({
  title: z.string().min(3, "Título requerido"),
  description: z.string().optional(),
  mediaUrl: z.string().url("Debe ser una URL válida"),
  mediaType: z.enum(["image", "pdf", "video"]).default("image"),
  evidenceType: z.enum(["compra", "entrega", "actividad", "resultado", "reporte"]).default("actividad"),
  date: z.string().min(10),
  isPublic: z.boolean().default(true),
});

export default function AdminCampaignDetail() {
  const { id } = useParams();
  const campaignId = Number(id);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"info"|"gallery"|"updates"|"gastos"|"evidencias">("info");

  const { data: campaign, isLoading } = useGetCampaign(campaignId);
  const { data: images } = useGetCampaignImages(campaignId);
  const { data: updates } = useGetCampaignUpdates(campaignId);
  const { data: expenses } = useCampaignExpenses(campaignId);
  const { data: evidence } = useCampaignEvidence(campaignId);

  const updateCampaign = useUpdateCampaign();
  const addImage = useAddCampaignImage();
  const deleteImage = useDeleteCampaignImage();
  const addUpdate = useCreateCampaignUpdate();
  const deleteUpdate = useDeleteCampaignUpdate();
  
  // Phase 3 Mutations
  const createExpense = useCreateExpense(campaignId);
  const updateExpense = useUpdateExpense(campaignId);
  const deleteExpense = useDeleteExpense(campaignId);
  
  const createEvidence = useCreateEvidence(campaignId);
  const updateEvidence = useUpdateEvidence(campaignId);
  const deleteEvidence = useDeleteEvidence(campaignId);

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

  const expenseForm = useForm<z.infer<typeof expenseSchema>>({
    resolver: zodResolver(expenseSchema),
    defaultValues: {
      description: "", category: "general", amount: 0, date: new Date().toISOString().split('T')[0],
      responsible: "", observations: "", receiptUrl: "", receiptType: "boleta", isPublic: true
    }
  });

  const evidenceForm = useForm<z.infer<typeof evidenceSchema>>({
    resolver: zodResolver(evidenceSchema),
    defaultValues: {
      title: "", description: "", mediaUrl: "", mediaType: "image", evidenceType: "actividad", 
      date: new Date().toISOString().split('T')[0], isPublic: true
    }
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

  const onExpenseSubmit = (values: z.infer<typeof expenseSchema>) => {
    createExpense.mutate(values, {
      onSuccess: () => {
        toast({ title: "Gasto registrado exitosamente" });
        expenseForm.reset({ ...expenseForm.getValues(), description: "", amount: 0, receiptUrl: "", observations: "" });
      }
    });
  };

  const onEvidenceSubmit = (values: z.infer<typeof evidenceSchema>) => {
    createEvidence.mutate(values, {
      onSuccess: () => {
        toast({ title: "Evidencia agregada exitosamente" });
        evidenceForm.reset({ ...evidenceForm.getValues(), title: "", description: "", mediaUrl: "" });
      }
    });
  };

  if (isLoading || !campaign) return <div className="p-8 flex justify-center"><div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full"></div></div>;

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto" data-testid="admin-campaign-detail">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center gap-4 mb-8">
        <Link href="/admin/campanas">
          <Button variant="ghost" size="icon" className="rounded-full shadow-sm bg-white"><ArrowLeft className="w-5 h-5"/></Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-3xl font-display font-bold">{campaign.title}</h1>
            <Badge variant="outline" className={campaign.status === 'active' ? 'bg-accent/10 text-accent border-accent/20' : ''}>
              {campaign.status}
            </Badge>
            {campaign.featured && <Badge className="bg-yellow-500 hover:bg-yellow-600">Destacada</Badge>}
          </div>
          <p className="text-muted-foreground mt-1 text-sm">Gestiona la información y la transparencia de la campaña.</p>
        </div>
        <div className="flex flex-wrap gap-2">
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
          <Link href={`/campanas/${campaignId}/transparencia`}>
            <Button variant="default" className="rounded-xl shadow-md hover-elevate">
              <Eye className="w-4 h-4 mr-2" /> Ver P. Transparente
            </Button>
          </Link>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex overflow-x-auto gap-1 mb-8 border-b border-border hide-scrollbar">
        {(["info", "gallery", "updates", "gastos", "evidencias"] as const).map(tab => (
          <button
            key={tab}
            className={`pb-3 px-4 text-sm font-semibold transition-all border-b-2 whitespace-nowrap flex items-center gap-2 ${activeTab === tab ? 'border-primary text-primary bg-primary/5 rounded-t-lg' : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-secondary/50 rounded-t-lg'}`}
            onClick={() => setActiveTab(tab)}
            data-testid={`tab-${tab}`}
          >
            {tab === "info" && "Info General"}
            {tab === "gallery" && <><ImageIcon className="w-4 h-4"/> Galería</>}
            {tab === "updates" && <><MessageSquarePlus className="w-4 h-4"/> Novedades</>}
            {tab === "gastos" && <><Receipt className="w-4 h-4"/> Gastos (F3)</>}
            {tab === "evidencias" && <><Camera className="w-4 h-4"/> Evidencias (F3)</>}
          </button>
        ))}
      </div>

      {/* TAB: INFO */}
      {activeTab === "info" && (
        <div className="bg-card border border-border rounded-2xl p-6 md:p-8 shadow-sm animate-in fade-in slide-in-from-bottom-2 duration-300">
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
        <div className="space-y-8 animate-in fade-in duration-300">
          <div className="bg-primary/5 border border-primary/20 rounded-2xl p-6">
            <h3 className="font-semibold mb-4 flex items-center gap-2"><ImageIcon className="w-5 h-5 text-primary"/> Agregar imagen pública</h3>
            <Form {...imageForm}>
              <form onSubmit={imageForm.handleSubmit(onImageSubmit)} className="flex flex-col md:flex-row gap-4 md:items-end">
                <FormField control={imageForm.control} name="imageUrl" render={({ field }) => (
                  <FormItem className="flex-1">
                    <FormLabel>Imagen</FormLabel>
                    <FormControl>
                      <ImageUploadField value={field.value} onChange={field.onChange} label="Imagen de galería" />
                    </FormControl>
                    <FormMessage/>
                  </FormItem>
                )} />
                <FormField control={imageForm.control} name="caption" render={({ field }) => (
                  <FormItem className="flex-1"><FormLabel>Descripción (Opcional)</FormLabel><FormControl><Input placeholder="Pie de foto" className="rounded-xl bg-background" {...field} /></FormControl></FormItem>
                )} />
                <Button type="submit" className="rounded-xl h-10 w-full md:w-auto" disabled={addImage.isPending} data-testid="btn-add-image">Agregar</Button>
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
        <div className="grid md:grid-cols-3 gap-8 animate-in fade-in duration-300">
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
                  <Button type="submit" className="w-full rounded-xl" disabled={addUpdate.isPending} data-testid="btn-add-update">Publicar</Button>
                </form>
              </Form>
            </div>
          </div>

          <div className="md:col-span-2 space-y-4">
            {updates?.map(update => (
              <div key={update.id} className="bg-card border border-border rounded-2xl p-5 shadow-sm flex flex-col">
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
            {updates?.length === 0 && <div className="py-12 text-center text-muted-foreground border-2 border-dashed border-border rounded-2xl h-full flex items-center justify-center">No hay actualizaciones publicadas.</div>}
          </div>
        </div>
      )}

      {/* TAB: GASTOS (PHASE 3) */}
      {activeTab === "gastos" && (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
          
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <div className="bg-white border border-border rounded-2xl p-4 shadow-sm flex items-center gap-4">
              <div className="p-3 bg-red-100 text-red-600 rounded-xl"><Receipt className="w-6 h-6"/></div>
              <div>
                <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Total Gastado</p>
                <p className="text-2xl font-display font-bold">S/ {expenses?.reduce((sum, e) => sum + e.amount, 0).toLocaleString("es-PE") || "0"}</p>
              </div>
            </div>
            <div className="bg-white border border-border rounded-2xl p-4 shadow-sm flex items-center gap-4">
              <div className="p-3 bg-green-100 text-green-600 rounded-xl"><Eye className="w-6 h-6"/></div>
              <div>
                <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Gasto Público</p>
                <p className="text-2xl font-display font-bold text-green-700">S/ {expenses?.filter(e=>e.isPublic).reduce((sum, e) => sum + e.amount, 0).toLocaleString("es-PE") || "0"}</p>
              </div>
            </div>
            <div className="bg-white border border-border rounded-2xl p-4 shadow-sm flex items-center gap-4">
              <div className="p-3 bg-secondary text-foreground rounded-xl"><ShieldAlert className="w-6 h-6"/></div>
              <div>
                <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Registros</p>
                <p className="text-2xl font-display font-bold">{expenses?.length || 0}</p>
              </div>
            </div>
          </div>

          <div className="bg-card border border-border rounded-3xl p-6 shadow-sm">
            <h3 className="font-display font-bold text-xl mb-6">Registrar Nuevo Gasto</h3>
            <Form {...expenseForm}>
              <form onSubmit={expenseForm.handleSubmit(onExpenseSubmit)} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <FormField control={expenseForm.control} name="date" render={({ field }) => (
                    <FormItem><FormLabel>Fecha</FormLabel><FormControl><Input type="date" className="bg-secondary/30 rounded-xl" {...field} /></FormControl></FormItem>
                  )} />
                  <FormField control={expenseForm.control} name="category" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Categoría</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl><SelectTrigger className="bg-secondary/30 rounded-xl"><SelectValue placeholder="Seleccionar" /></SelectTrigger></FormControl>
                        <SelectContent>
                          {["alimentación", "transporte", "materiales", "logística", "comunicación", "salud", "educación", "general"].map(c => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )} />
                  <FormField control={expenseForm.control} name="amount" render={({ field }) => (
                    <FormItem><FormLabel>Monto (S/)</FormLabel><FormControl><Input type="number" step="0.01" className="bg-secondary/30 rounded-xl" {...field} /></FormControl><FormMessage/></FormItem>
                  )} />
                  <FormField control={expenseForm.control} name="receiptType" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tipo de Comprobante</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl><SelectTrigger className="bg-secondary/30 rounded-xl"><SelectValue placeholder="Seleccionar" /></SelectTrigger></FormControl>
                        <SelectContent>
                          {["boleta", "factura", "voucher", "foto", "pdf", "otro"].map(c => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )} />
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField control={expenseForm.control} name="description" render={({ field }) => (
                    <FormItem><FormLabel>Descripción Breve</FormLabel><FormControl><Input placeholder="Ej. Compra de panetones" className="bg-secondary/30 rounded-xl" {...field} /></FormControl><FormMessage/></FormItem>
                  )} />
                  <FormField control={expenseForm.control} name="receiptUrl" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Comprobante (Opcional)</FormLabel>
                      <FormControl>
                        <ImageUploadField value={field.value} onChange={field.onChange} label="Comprobante" />
                      </FormControl>
                    </FormItem>
                  )} />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField control={expenseForm.control} name="responsible" render={({ field }) => (
                    <FormItem><FormLabel>Responsable / Proveedor (Opcional)</FormLabel><FormControl><Input placeholder="Nombre de persona o empresa" className="bg-secondary/30 rounded-xl" {...field} /></FormControl></FormItem>
                  )} />
                  <div className="flex items-center space-x-6 bg-secondary/30 rounded-xl p-4 border border-border">
                    <FormField control={expenseForm.control} name="isPublic" render={({ field }) => (
                      <FormItem className="flex items-center gap-3 space-y-0">
                        <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                        <div className="space-y-0.5"><FormLabel className="cursor-pointer">Gasto Público</FormLabel><p className="text-xs text-muted-foreground">Visible en la página de transparencia</p></div>
                      </FormItem>
                    )} />
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <Button type="submit" disabled={createExpense.isPending} className="rounded-xl px-8 h-12 shadow-md hover-elevate">
                    <Save className="w-4 h-4 mr-2" /> Registrar Gasto
                  </Button>
                </div>
              </form>
            </Form>
          </div>

          <div className="bg-white rounded-3xl border border-border shadow-sm overflow-hidden" data-testid="expenses-table">
            <Table>
              <TableHeader className="bg-secondary/50">
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Descripción</TableHead>
                  <TableHead>Monto</TableHead>
                  <TableHead>Categoría / Tipo</TableHead>
                  <TableHead className="text-center">Visibilidad</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {expenses?.map(exp => (
                  <TableRow key={exp.id}>
                    <TableCell className="font-medium whitespace-nowrap">{format(new Date(exp.date), "dd/MM/yyyy")}</TableCell>
                    <TableCell>
                      <div className="font-medium text-foreground">{exp.description}</div>
                      {exp.responsible && <div className="text-xs text-muted-foreground">Resp: {exp.responsible}</div>}
                    </TableCell>
                    <TableCell className="font-bold whitespace-nowrap">S/ {exp.amount}</TableCell>
                    <TableCell>
                      <div className="flex gap-1.5 flex-wrap">
                        <Badge variant="outline" className="text-[10px] uppercase bg-secondary">{exp.category}</Badge>
                        {exp.receiptType && <Badge variant="secondary" className="text-[10px] uppercase">{exp.receiptType}</Badge>}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <Switch 
                        checked={exp.isPublic} 
                        onCheckedChange={(val) => updateExpense.mutate({ id: exp.id, data: { isPublic: val } })}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        {exp.receiptUrl && (
                          <a href={exp.receiptUrl} target="_blank" rel="noreferrer" className="p-2 text-primary hover:bg-primary/10 rounded-lg transition-colors"><FileText className="w-4 h-4" /></a>
                        )}
                        <Button variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10" onClick={() => { if(confirm("¿Eliminar gasto?")) deleteExpense.mutate(exp.id) }}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {expenses?.length === 0 && (
                  <TableRow><TableCell colSpan={6} className="text-center h-24 text-muted-foreground">No hay gastos registrados.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* TAB: EVIDENCIAS (PHASE 3) */}
      {activeTab === "evidencias" && (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
          
          <div className="bg-card border border-border rounded-3xl p-6 shadow-sm">
            <h3 className="font-display font-bold text-xl mb-6">Agregar Nueva Evidencia</h3>
            <Form {...evidenceForm}>
              <form onSubmit={evidenceForm.handleSubmit(onEvidenceSubmit)} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                  <div className="md:col-span-8">
                    <FormField control={evidenceForm.control} name="title" render={({ field }) => (
                      <FormItem><FormLabel>Título / Descripción corta</FormLabel><FormControl><Input placeholder="Ej. Entrega de juguetes en Anexo X" className="bg-secondary/30 rounded-xl" {...field} /></FormControl><FormMessage/></FormItem>
                    )} />
                  </div>
                  <div className="md:col-span-4">
                    <FormField control={evidenceForm.control} name="date" render={({ field }) => (
                      <FormItem><FormLabel>Fecha de actividad</FormLabel><FormControl><Input type="date" className="bg-secondary/30 rounded-xl" {...field} /></FormControl><FormMessage/></FormItem>
                    )} />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <FormField control={evidenceForm.control} name="mediaUrl" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Foto / Archivo</FormLabel>
                      <FormControl>
                        <ImageUploadField value={field.value} onChange={field.onChange} label="Evidencia" />
                      </FormControl>
                      <FormMessage/>
                    </FormItem>
                  )} />
                  <FormField control={evidenceForm.control} name="mediaType" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tipo de Archivo</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl><SelectTrigger className="bg-secondary/30 rounded-xl"><SelectValue placeholder="Seleccionar" /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="image">Imagen</SelectItem>
                          <SelectItem value="pdf">Documento PDF</SelectItem>
                          <SelectItem value="video">Enlace a Video</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )} />
                  <FormField control={evidenceForm.control} name="evidenceType" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Etiqueta de Evidencia</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl><SelectTrigger className="bg-secondary/30 rounded-xl"><SelectValue placeholder="Seleccionar" /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="compra">Compra de materiales</SelectItem>
                          <SelectItem value="entrega">Entrega a beneficiarios</SelectItem>
                          <SelectItem value="actividad">Actividad / Evento</SelectItem>
                          <SelectItem value="resultado">Resultado final</SelectItem>
                          <SelectItem value="reporte">Reporte formal</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )} />
                </div>

                <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-secondary/30 rounded-xl p-4 border border-border mt-4">
                  <FormField control={evidenceForm.control} name="isPublic" render={({ field }) => (
                    <FormItem className="flex items-center gap-3 space-y-0">
                      <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                      <div className="space-y-0.5"><FormLabel className="cursor-pointer">Evidencia Pública</FormLabel><p className="text-xs text-muted-foreground">Visible para todos en el panel de transparencia</p></div>
                    </FormItem>
                  )} />
                  <Button type="submit" disabled={createEvidence.isPending} className="rounded-xl px-8 shadow-md hover-elevate w-full md:w-auto">
                    <Save className="w-4 h-4 mr-2" /> Guardar Evidencia
                  </Button>
                </div>
              </form>
            </Form>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6" data-testid="evidence-grid">
            {evidence?.map(ev => (
              <div key={ev.id} className={`bg-white rounded-2xl border ${ev.isPublic ? 'border-border' : 'border-dashed border-orange-300 bg-orange-50/30'} shadow-sm overflow-hidden flex flex-col relative`}>
                {!ev.isPublic && (
                  <div className="absolute top-2 left-2 z-10 bg-orange-100 text-orange-800 text-[10px] font-bold px-2 py-1 rounded-md flex items-center gap-1">
                    <EyeOff className="w-3 h-3"/> Privado
                  </div>
                )}
                <div className="aspect-video bg-secondary flex items-center justify-center relative overflow-hidden">
                  {ev.mediaType === 'image' ? (
                    <img src={ev.mediaUrl} alt={ev.title} className="w-full h-full object-cover" />
                  ) : (
                    <div className="flex flex-col items-center text-muted-foreground"><FileText className="w-8 h-8 mb-2 opacity-50"/> <span className="text-xs font-semibold uppercase">{ev.mediaType}</span></div>
                  )}
                  <Badge className="absolute bottom-2 right-2 bg-black/60 backdrop-blur-md hover:bg-black/80 border-none text-[10px]">{ev.evidenceType}</Badge>
                </div>
                <div className="p-4 flex-1 flex flex-col">
                  <h4 className="font-bold text-sm mb-1 leading-tight">{ev.title}</h4>
                  <div className="text-xs text-muted-foreground mb-4">{format(new Date(ev.date), "dd/MM/yyyy")}</div>
                  
                  <div className="mt-auto flex justify-between items-center pt-3 border-t border-border">
                    <div className="flex items-center gap-2 text-xs">
                      <Switch checked={ev.isPublic} onCheckedChange={(val) => updateEvidence.mutate({ id: ev.id, data: { isPublic: val }})} aria-label="Toggle visibility" />
                      <span className="text-muted-foreground font-medium">{ev.isPublic ? 'Público' : 'Oculto'}</span>
                    </div>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10" onClick={() => { if(confirm("¿Eliminar evidencia?")) deleteEvidence.mutate(ev.id) }}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
            {evidence?.length === 0 && (
              <div className="col-span-full bg-card rounded-3xl border-2 border-dashed border-border p-12 text-center text-muted-foreground">
                <Camera className="w-12 h-12 mx-auto mb-3 opacity-20" />
                <p>No hay evidencias registradas.</p>
              </div>
            )}
          </div>

        </div>
      )}

    </div>
  );
}

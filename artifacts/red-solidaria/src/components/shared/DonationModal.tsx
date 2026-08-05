import { useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Checkbox } from "@/components/ui/checkbox";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useCreateDonation } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { CreditCard, Landmark, Phone, Heart, CheckCircle2, ChevronRight, ChevronLeft, UploadCloud, Trash2, Loader2 } from "lucide-react";
import confetti from "canvas-confetti";
import { uploadImageToCloudinary, validateProofImage } from "@/lib/cloudinary-upload";

const donationSchema = z.object({
  amount: z.coerce.number().min(5, "El monto mínimo es S/ 5"),
  paymentMethod: z.enum(["yape", "plin", "transfer", "card", "cash", "other"], {
    required_error: "Selecciona un método de pago",
  }),
  message: z.string().optional(),
  anonymous: z.boolean().default(false),
  publicProof: z.boolean().default(false),
  firstName: z.string().min(2, "Ingresa tu nombre"),
  lastName: z.string().min(2, "Ingresa tu apellido"),
  email: z.string().email("Correo inválido"),
  phone: z.string().optional(),
  receiptNote: z.string().optional(),
});

type DonationFormValues = z.infer<typeof donationSchema>;

interface DonationModalProps {
  open: boolean;
  onClose: () => void;
  campaignId?: number;
  campaignTitle?: string;
}

export function DonationModal({ open, onClose, campaignId, campaignTitle }: DonationModalProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [isSuccess, setIsSuccess] = useState(false);
  const [donationId, setDonationId] = useState<number | null>(null);
  const [proofUrl, setProofUrl] = useState<string | null>(null);
  const [proofPublicId, setProofPublicId] = useState<string | null>(null);
  const [proofMimeType, setProofMimeType] = useState<string | null>(null);
  const [proofFileName, setProofFileName] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createDonation = useCreateDonation();

  const form = useForm<DonationFormValues>({
    resolver: zodResolver(donationSchema),
    defaultValues: {
      amount: 50,
      paymentMethod: "yape",
      message: "",
      anonymous: false,
      publicProof: false,
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      receiptNote: "",
    },
  });

  const paymentMethod = form.watch("paymentMethod");
  const amount = form.watch("amount");
  const requiresReceipt = ["yape", "plin", "transfer"].includes(paymentMethod);

  const triggerConfetti = () => {
    const duration = 3 * 1000;
    const animationEnd = Date.now() + duration;
    const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 10000 };

    const randomInRange = (min: number, max: number) => Math.random() * (max - min) + min;

    const interval: any = setInterval(function() {
      const timeLeft = animationEnd - Date.now();

      if (timeLeft <= 0) {
        return clearInterval(interval);
      }

      const particleCount = 50 * (timeLeft / duration);
      confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 } });
      confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 } });
    }, 250);
  };

  const handleProofFile = async (file: File) => {
    const error = validateProofImage(file);
    if (error) {
      toast({ title: "Archivo inválido", description: error, variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const result = await uploadImageToCloudinary(file, "/api/uploads/signature");
      setProofUrl(result.imageUrl);
      setProofPublicId(result.publicId);
      setProofMimeType(file.type);
      setProofFileName(file.name);
      toast({ title: "Comprobante subido", description: "Gracias. Un administrador lo revisará para validar tu donación." });
    } catch (err) {
      toast({
        title: "Error al subir",
        description: err instanceof Error ? err.message : "Intenta de nuevo más tarde.",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const removeProof = () => {
    setProofUrl(null);
    setProofPublicId(null);
    setProofMimeType(null);
    setProofFileName(null);
  };

  const onSubmit = (data: DonationFormValues) => {
    createDonation.mutate(
      {
        data: {
          ...data,
          campaignId: campaignId || null,
          proofImageUrl: proofUrl,
          proofPublicId,
          proofMimeType,
        }
      },
      {
        onSuccess: (res) => {
          setDonationId(res.id);
          setIsSuccess(true);
          triggerConfetti();
          queryClient.invalidateQueries({ queryKey: ["/api/donations"] });
          if (campaignId) {
            queryClient.invalidateQueries({ queryKey: [`/api/campaigns/${campaignId}/donations`] });
            queryClient.invalidateQueries({ queryKey: [`/api/campaigns/${campaignId}/donors`] });
          }
        },
        onError: () => {
          toast({ title: "Error", description: "No se pudo procesar la donación.", variant: "destructive" });
        }
      }
    );
  };

  const handleNextStep = async () => {
    const isValid = await form.trigger(["amount", "paymentMethod"]);
    if (isValid) setStep(2);
  };

  const resetAndClose = () => {
    onClose();
    setTimeout(() => {
      setStep(1);
      setIsSuccess(false);
      setDonationId(null);
      removeProof();
      form.reset();
    }, 300);
  };

  if (isSuccess) {
    return (
      <Dialog open={open} onOpenChange={resetAndClose}>
        <DialogContent className="sm:max-w-[500px] text-center p-8 rounded-3xl" data-testid="donation-success-modal">
          <div className="mx-auto w-20 h-20 bg-accent/20 text-accent rounded-full flex items-center justify-center mb-6">
            <CheckCircle2 className="w-10 h-10" />
          </div>
          <DialogTitle className="text-3xl font-display font-bold mb-2">¡Gracias por tu donación!</DialogTitle>
          <DialogDescription className="text-lg text-muted-foreground mb-8">
            Tu apoyo transforma vidas. Revisaremos tu comprobante y confirmaremos la donación en las próximas 24 horas.
            <br/><br/>
            <span className="font-semibold text-foreground">ID de Donación: #{donationId}</span>
          </DialogDescription>
          <Button onClick={resetAndClose} className="w-full h-12 text-lg rounded-xl shadow-md hover-elevate">
            Volver
          </Button>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={open ? undefined : resetAndClose}>
      <DialogContent className="sm:max-w-[600px] rounded-3xl p-0 overflow-hidden" data-testid="donation-modal">
        <div className="bg-primary/5 p-6 border-b border-border/50">
          <DialogHeader>
            <DialogTitle className="text-2xl font-display font-bold">
              {campaignTitle ? `Donar a: ${campaignTitle}` : "Hacer una Donación General"}
            </DialogTitle>
            <DialogDescription>
              {step === 1 ? "Paso 1: Monto y Método" : "Paso 2: Tus Datos y Comprobante"}
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="p-6 max-h-[75vh] overflow-y-auto">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              
              {/* STEP 1 */}
              <div className={step === 1 ? "block" : "hidden"}>
                <FormField
                  control={form.control}
                  name="amount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-base font-semibold">Monto a donar (S/)</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          className="h-14 text-2xl font-bold text-center rounded-xl" 
                          data-testid="donation-amount"
                          {...field} 
                        />
                      </FormControl>
                      <div className="flex flex-wrap gap-2 mt-3 justify-center">
                        {[20, 50, 100, 200, 500].map(val => (
                          <Button
                            key={val}
                            type="button"
                            variant={amount === val ? "default" : "outline"}
                            className={`rounded-xl ${amount === val ? 'shadow-md' : ''}`}
                            onClick={() => form.setValue("amount", val)}
                          >
                            S/ {val}
                          </Button>
                        ))}
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="mt-8">
                  <p className="text-base font-semibold block mb-4">Método de pago</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    
                    <div 
                      className={`relative border rounded-2xl p-4 cursor-pointer transition-all hover-elevate ${paymentMethod === 'yape' ? 'border-primary bg-primary/5 shadow-sm' : 'border-border bg-card'}`}
                      onClick={() => form.setValue("paymentMethod", "yape")}
                      data-testid="btn-payment-yape"
                    >
                      <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 rounded-full bg-[#8A3781]/10 text-[#8A3781] flex items-center justify-center">
                          <Phone className="w-5 h-5" />
                        </div>
                        <span className="font-bold text-foreground">Yape</span>
                      </div>
                      <p className="text-xs text-muted-foreground">Envía al 921 615 737</p>
                    </div>

                    <div 
                      className={`relative border rounded-2xl p-4 cursor-pointer transition-all hover-elevate ${paymentMethod === 'plin' ? 'border-primary bg-primary/5 shadow-sm' : 'border-border bg-card'}`}
                      onClick={() => form.setValue("paymentMethod", "plin")}
                    >
                      <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 rounded-full bg-[#00D09E]/10 text-[#00D09E] flex items-center justify-center">
                          <Phone className="w-5 h-5" />
                        </div>
                        <span className="font-bold text-foreground">Plin</span>
                      </div>
                      <p className="text-xs text-muted-foreground">Envía al 921 615 737</p>
                    </div>

                    <div 
                      className={`relative border rounded-2xl p-4 cursor-pointer transition-all hover-elevate ${paymentMethod === 'transfer' ? 'border-primary bg-primary/5 shadow-sm' : 'border-border bg-card'}`}
                      onClick={() => form.setValue("paymentMethod", "transfer")}
                    >
                      <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 rounded-full bg-blue-500/10 text-blue-600 flex items-center justify-center">
                          <Landmark className="w-5 h-5" />
                        </div>
                        <span className="font-bold text-foreground">Transferencia</span>
                      </div>
                      <p className="text-xs text-muted-foreground">BCP: 193-12345678-0-55</p>
                    </div>

                    <div className="relative border rounded-2xl p-4 opacity-50 cursor-not-allowed bg-card">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 rounded-full bg-slate-500/10 text-slate-600 flex items-center justify-center">
                          <CreditCard className="w-5 h-5" />
                        </div>
                        <span className="font-bold text-foreground">Tarjeta</span>
                      </div>
                      <p className="text-xs text-muted-foreground">Próximamente disponible</p>
                    </div>

                  </div>
                </div>

                <div className="mt-8 space-y-4">
                  <FormField
                    control={form.control}
                    name="message"
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <Textarea 
                            placeholder="Deja un mensaje de aliento (opcional)" 
                            className="resize-none rounded-xl bg-secondary/30" 
                            {...field} 
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="anonymous"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-xl border border-border p-4 bg-card">
                        <FormControl>
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            className="mt-1"
                          />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                          <FormLabel className="cursor-pointer">Donar de forma anónima</FormLabel>
                          <p className="text-sm text-muted-foreground">Tu nombre no aparecerá en la lista pública de donantes.</p>
                        </div>
                      </FormItem>
                    )}
                  />
                </div>

                <div className="mt-8">
                  <Button type="button" onClick={handleNextStep} className="w-full h-14 text-lg rounded-xl shadow-md hover-elevate">
                    Continuar <ChevronRight className="w-5 h-5 ml-2" />
                  </Button>
                </div>
              </div>

              {/* STEP 2 */}
              <div className={step === 2 ? "block" : "hidden"}>
                <div className="grid grid-cols-2 gap-4">
                  <FormField control={form.control} name="firstName" render={({ field }) => (
                    <FormItem><FormLabel>Nombre</FormLabel><FormControl><Input className="rounded-xl bg-secondary/30" data-testid="input-first-name" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="lastName" render={({ field }) => (
                    <FormItem><FormLabel>Apellido</FormLabel><FormControl><Input className="rounded-xl bg-secondary/30" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                </div>
                
                <div className="grid grid-cols-2 gap-4 mt-4">
                  <FormField control={form.control} name="email" render={({ field }) => (
                    <FormItem><FormLabel>Correo Electrónico</FormLabel><FormControl><Input type="email" className="rounded-xl bg-secondary/30" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="phone" render={({ field }) => (
                    <FormItem><FormLabel>Teléfono (Opcional)</FormLabel><FormControl><Input type="tel" className="rounded-xl bg-secondary/30" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                </div>

                {requiresReceipt && (
                  <div className="mt-6 p-5 border border-primary/20 bg-primary/5 rounded-2xl space-y-4">
                    <div className="flex items-center gap-2 text-primary font-medium">
                      <Landmark className="w-5 h-5" /> Comprobante de pago
                    </div>
                    <p className="text-sm text-muted-foreground -mt-2">
                      Sube la captura de tu {paymentMethod === "transfer" ? "transferencia" : paymentMethod.toUpperCase()}. Esto nos permite validar tu donación y sumarla al recaudado.
                    </p>

                    <FormField control={form.control} name="receiptNote" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Número de operación (opcional)</FormLabel>
                        <FormControl><Input placeholder="Ej. Op: 12345678" className="bg-background rounded-xl" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />

                    {/* Uploader */}
                    {proofUrl ? (
                      <div className="rounded-2xl border border-green-200 bg-green-50 p-4">
                        <div className="flex items-start gap-4">
                          <img src={proofUrl} alt="Comprobante" className="w-24 h-24 object-cover rounded-xl border border-green-200 bg-white" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-green-800 truncate">{proofFileName || "Comprobante subido"}</p>
                            <p className="text-xs text-green-700 mt-0.5">Listo para validación por el equipo.</p>
                            <Button type="button" variant="ghost" size="sm" className="mt-2 text-red-600 hover:text-red-700 hover:bg-red-50 px-2 h-8" onClick={removeProof}>
                              <Trash2 className="w-4 h-4 mr-1" /> Quitar
                            </Button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div
                        className="border-2 border-dashed border-primary/30 rounded-2xl p-6 text-center cursor-pointer hover:border-primary/60 hover:bg-primary/5 transition-colors"
                        onClick={() => fileInputRef.current?.click()}
                        data-testid="proof-uploader"
                      >
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleProofFile(file);
                          }}
                        />
                        {uploading ? (
                          <div className="flex flex-col items-center gap-2 py-2">
                            <Loader2 className="w-8 h-8 text-primary animate-spin" />
                            <span className="text-sm font-medium text-muted-foreground">Subiendo comprobante...</span>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center gap-2 py-2">
                            <UploadCloud className="w-8 h-8 text-primary" />
                            <span className="text-sm font-semibold">Sube la captura de tu pago</span>
                            <span className="text-xs text-muted-foreground">JPG, PNG o WebP · máx 8 MB</span>
                          </div>
                        )}
                      </div>
                    )}

                    {proofUrl && (
                      <FormField
                        control={form.control}
                        name="publicProof"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-xl border border-border p-4 bg-background">
                            <FormControl>
                              <Checkbox
                                checked={field.value}
                                onCheckedChange={field.onChange}
                                className="mt-1"
                              />
                            </FormControl>
                            <div className="space-y-1 leading-none">
                              <FormLabel className="cursor-pointer">Mostrar mi recibo al público</FormLabel>
                              <p className="text-sm text-muted-foreground">
                                Si lo marcas, tu comprobante aparecerá en la lista de donantes de la campaña. Si no, solo el equipo lo verá al validar.
                              </p>
                            </div>
                          </FormItem>
                        )}
                      />
                    )}
                  </div>
                )}

                <div className="mt-8 bg-secondary rounded-2xl p-5 border border-border">
                  <h4 className="font-semibold mb-3 flex items-center gap-2"><Heart className="w-4 h-4 text-primary"/> Resumen</h4>
                  <div className="flex justify-between items-center text-sm mb-2">
                    <span className="text-muted-foreground">Monto:</span>
                    <span className="font-bold text-lg">S/ {amount}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm mb-2">
                    <span className="text-muted-foreground">Método:</span>
                    <span className="capitalize font-medium">{paymentMethod}</span>
                  </div>
                  {campaignTitle && (
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-muted-foreground">Campaña:</span>
                      <span className="font-medium text-right max-w-[200px] truncate">{campaignTitle}</span>
                    </div>
                  )}
                </div>

                <div className="mt-8 flex gap-3">
                  <Button type="button" variant="outline" onClick={() => setStep(1)} className="h-14 px-6 rounded-xl">
                    <ChevronLeft className="w-5 h-5 mr-1" /> Atrás
                  </Button>
                  <Button type="submit" className="flex-1 h-14 text-lg rounded-xl shadow-md hover-elevate" disabled={createDonation.isPending || uploading} data-testid="btn-submit-donation">
                    {createDonation.isPending ? "Procesando..." : "Confirmar Donación"}
                  </Button>
                </div>
              </div>

            </form>
          </Form>
        </div>
      </DialogContent>
    </Dialog>
  );
}

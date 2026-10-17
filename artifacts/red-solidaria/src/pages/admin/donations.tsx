import { useEffect, useState, useRef } from "react";
import { 
  useGetDonations, 
  useUpdateDonationStatus, 
  useGetDonationStats,
  useAddDonationProof
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { CheckCircle, XCircle, Search, ExternalLink, Image as ImageIcon, UploadCloud, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { uploadImageToCloudinary, validateProofImage, UploadError } from "@/lib/cloudinary-upload";
import { useReconcileDonation } from "@/hooks/use-donors-admin";
import { invalidateDonationQueries } from "@/lib/query-invalidation";
import { collaborationTypeLabel, isMoneyCollaboration } from "@/lib/donors-admin";
import { DonationVoidAction } from "@/components/admin/DonationVoidAction";

type FilterStatus =
  | "all"
  | "pending"
  | "approved"
  | "rejected"
  | "reconciled"
  | "annulled";

export default function AdminDonations() {
  const [filter, setFilter] = useState<FilterStatus>("all");
  const [search, setSearch] = useState("");
  const [rejectDialogId, setRejectDialogId] = useState<number | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [receiptImage, setReceiptImage] = useState<string | null>(null);
  const [proofUploadId, setProofUploadId] = useState<number | null>(null);
  const [proofUploading, setProofUploading] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualSaving, setManualSaving] = useState(false);
  const [manualError, setManualError] = useState("");
  const [manualCampaigns, setManualCampaigns] = useState<{ id: number; title: string; status: string }[]>([]);
  const [manualForm, setManualForm] = useState({
    firstName: "", lastName: "", email: "", phone: "", amount: "", paymentMethod: "cash",
    collaborationType: "dinero", product: "panetones", productOther: "", quantity: "1",
    unit: "unidad", estimatedValue: "", campaignId: "", message: "",
  });
  const proofFileRef = useRef<HTMLInputElement>(null);

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const updateStatus = useUpdateDonationStatus();
  const reconcile = useReconcileDonation();
  const addProof = useAddDonationProof();

  useEffect(() => {
    let active = true;
    fetch("/api/campaigns?limit=100")
      .then((res) => (res.ok ? res.json() : []))
      .then((rows: { id: number; title: string; status: string }[]) => {
        if (active && Array.isArray(rows)) setManualCampaigns(rows.filter((row) => row.status === "active" || row.status === "completed"));
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  // Fetch stats unconditionally
  const { data: stats } = useGetDonationStats();

  // Fetch filtered donations
  const apiFilterStatus = filter === "all" ? undefined : filter;
  const { data: donations, isLoading } = useGetDonations(
    apiFilterStatus ? { status: apiFilterStatus } : undefined
  );

  // Búsqueda local por donante, email, campaña, método o tipo de colaboración
  const query = search.trim().toLowerCase();
  const filteredDonations = (donations ?? []).filter((d) => {
    if (!query) return true;
    const donor = d.anonymous ? "" : `${d.firstName} ${d.lastName}`.toLowerCase();
    return (
      donor.includes(query) ||
      (d.email ?? "").toLowerCase().includes(query) ||
      (d.campaignTitle ?? "").toLowerCase().includes(query) ||
      (d.paymentMethod ?? "").toLowerCase().includes(query) ||
      (d.collaborationType ? collaborationTypeLabel(d.collaborationType) : "")
        .toLowerCase()
        .includes(query)
    );
  });

  // El servidor responde 400 con { error, message } (p. ej. "Se requiere un
  // comprobante..." o transición inválida); lo mostramos tal cual.
  const mutationError = (err: unknown) =>
    (err as { data?: { message?: string } })?.data?.message ||
    "No se pudo actualizar el estado de la donación.";

  // Guard anti-stale: si la fila no trae id numérico (p. ej. datos cacheados
  // de una sesión anterior a un redeploy), NO disparamos PUT /undefined:
  // recargamos la lista y avisamos.
  const isInvalidRowId = (id: unknown): boolean =>
    typeof id !== "number" || !Number.isFinite(id);

  const handleApprove = (id: number) => {
    if (isInvalidRowId(id)) {
      toast({
        title: "Datos desactualizados",
        description: "Recargando las donaciones…",
        variant: "destructive",
      });
      invalidateDonationQueries(queryClient);
      return;
    }
    updateStatus.mutate(
      { id, data: { status: "approved" } },
      {
        onSuccess: () => {
          toast({ title: "Donación aprobada", description: "El estado ha sido actualizado." });
          // Aprobar cambia el monto recaudado y el panel de transparencia: se
          // refresca la entidad donaciones Y la entidad campañas.
          invalidateDonationQueries(queryClient);
        },
        onError: (err) => {
          toast({ title: "No se pudo aprobar", description: mutationError(err), variant: "destructive" });
        }
      }
    );
  };

  const handleReject = () => {
    const id = rejectDialogId;
    if (typeof id !== "number" || !Number.isFinite(id)) {
      setRejectDialogId(null);
      toast({
        title: "Datos desactualizados",
        description: "Recargando las donaciones…",
        variant: "destructive",
      });
      invalidateDonationQueries(queryClient);
      return;
    }
    updateStatus.mutate(
      { id, data: { status: "rejected", adminNote: rejectNote } },
      {
        onSuccess: () => {
          toast({ title: "Donación rechazada", description: "Se guardó la nota de rechazo." });
          invalidateDonationQueries(queryClient);
          setRejectDialogId(null);
          setRejectNote("");
        },
        onError: (err) => {
          toast({ title: "No se pudo rechazar", description: mutationError(err), variant: "destructive" });
        }
      }
    );
  };

  // Adjuntar comprobante como admin: sube la imagen a Cloudinary (firma del
  // servidor admin) y la registra en la donación vía POST /donations/:id/proofs.
  const handleAttachProofFile = async (id: number, file: File) => {
    const error = validateProofImage(file);
    if (error) {
      toast({
        title: "Archivo inválido",
        description: error === "size" ? "Máximo 8 MB." : "Solo JPG, PNG o WebP.",
        variant: "destructive",
      });
      return;
    }
    setProofUploading(true);
    try {
      const { imageUrl, publicId } = await uploadImageToCloudinary(file, "/api/uploads/admin-signature");
      addProof.mutate(
        { id, data: { imageUrl, publicId, mimeType: file.type } },
        {
          onSuccess: () => {
            toast({ title: "Comprobante adjuntado", description: "Se guardó el comprobante de la donación." });
            queryClient.invalidateQueries({ queryKey: ["/api/donations"] });
            queryClient.invalidateQueries({ queryKey: [`/api/donations/${id}/proofs`] });
            setProofUploadId(null);
            if (proofFileRef.current) proofFileRef.current.value = "";
          },
          onError: (err) => {
            toast({ title: "No se pudo adjuntar", description: mutationError(err), variant: "destructive" });
          },
        },
      );
    } catch (err) {
      toast({
        title: "Error al subir",
        description:
          err instanceof UploadError
            ? err.message
            : err instanceof Error
              ? err.message
              : "No se pudo subir la imagen. Intenta más tarde.",
        variant: "destructive",
      });
    } finally {
      setProofUploading(false);
    }
  };

  const handleManualSubmit = async () => {
    setManualError("");
    setManualSaving(true);
    try {
      const email = manualForm.email.trim() ||
        `registro-${Date.now()}@sin-correo.redsolidaria.invalid`;
      const isMoney = manualForm.collaborationType === "dinero";
      const payload = {
        firstName: manualForm.firstName.trim(),
        lastName: manualForm.lastName.trim(),
        email,
        phone: manualForm.phone.trim() || undefined,
        amount: isMoney ? Number(manualForm.amount) : 0,
        paymentMethod: isMoney ? manualForm.paymentMethod : undefined,
        collaborationType: manualForm.collaborationType,
        items: isMoney ? undefined : [{
          product: manualForm.product,
          productOther: manualForm.product === "otros" ? manualForm.productOther.trim() : undefined,
          quantity: Number(manualForm.quantity),
          unit: manualForm.unit,
          description: manualForm.message.trim() || undefined,
          estimatedValue: Number(manualForm.estimatedValue || 0),
        }],
        campaignId: manualForm.campaignId ? Number(manualForm.campaignId) : null,
        message: manualForm.message.trim() || (isMoney
          ? "Aporte coordinado por WhatsApp y registrado por el equipo."
          : "Aporte en especie coordinado por WhatsApp y registrado por el equipo."),
        receiptNote: isMoney ? "Registro administrativo de aporte coordinado por WhatsApp" : undefined,
        anonymous: false,
        publicProof: false,
        contactConsent: false,
      };
      const response = await fetch("/api/donations", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => null) as { message?: string } | null;
      if (!response.ok) throw new Error(result?.message || "No se pudo registrar el aporte.");
      toast({
        title: "Aporte registrado",
        description: "Quedó pendiente de revisión. Adjunta el comprobante si corresponde y apruébalo para que aparezca en transparencia.",
      });
      setManualOpen(false);
      setManualForm({ firstName: "", lastName: "", email: "", phone: "", amount: "", paymentMethod: "cash", collaborationType: "dinero", product: "panetones", productOther: "", quantity: "1", unit: "unidad", estimatedValue: "", campaignId: "", message: "" });
      invalidateDonationQueries(queryClient);
    } catch (error) {
      setManualError(error instanceof Error ? error.message : "No se pudo registrar el aporte.");
    } finally {
      setManualSaving(false);
    }
  };

  const statusColors: Record<string, string> = {
    pending: "bg-yellow-500 hover:bg-yellow-600 text-white",
    approved: "bg-accent hover:bg-accent text-white",
    rejected: "bg-destructive hover:bg-destructive text-white",
    reconciled: "bg-emerald-600 hover:bg-emerald-700 text-white",
    // Anulada contablemente (V7.2.2): distinta de un rechazo administrativo.
    annulled: "bg-slate-600 hover:bg-slate-700 text-white"
  };

  const statusLabels: Record<string, string> = {
    pending: "Pendiente",
    approved: "Aprobada",
    rejected: "Rechazada",
    reconciled: "Conciliada",
    annulled: "Anulada"
  };

  // Formato defensivo: un createdAt corrupto/nulo no debe tumbar la página
  const formatDate = (value?: string | null) => {
    if (!value) return "—";
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? "—" : format(d, "dd/MM/yy HH:mm");
  };

  return (
    <div className="p-8 max-w-[1400px] mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold font-display">Gestión de Donaciones</h1>
        <p className="text-muted-foreground mt-1">Revisa, aprueba y administra las donaciones recibidas.</p>
        <div className="mt-4">
          <Button onClick={() => setManualOpen(true)} className="rounded-xl" data-testid="btn-register-manual-donation">
            Registrar aporte coordinado
          </Button>
        </div>
      </div>

      {/* Stats Row */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-card border border-border p-5 rounded-2xl shadow-sm">
            <div className="text-sm font-medium text-muted-foreground mb-1">Total Recaudado</div>
            <div className="text-2xl font-bold text-foreground">S/ {Number(stats.totalAmount ?? 0).toLocaleString()}</div>
          </div>
          <div className="bg-card border border-border p-5 rounded-2xl shadow-sm">
            <div className="text-sm font-medium text-muted-foreground mb-1">Total Donaciones</div>
            <div className="text-2xl font-bold text-foreground">{stats.totalDonations}</div>
          </div>
          <div className="bg-card border-l-4 border-yellow-500 p-5 rounded-2xl shadow-sm">
            <div className="text-sm font-medium text-muted-foreground mb-1">Pendientes</div>
            <div className="text-2xl font-bold text-yellow-700">{stats.pendingCount}</div>
          </div>
          <div className="bg-card border-l-4 border-accent p-5 rounded-2xl shadow-sm">
            <div className="text-sm font-medium text-muted-foreground mb-1">Aprobadas</div>
            <div className="text-2xl font-bold text-accent">{stats.approvedCount}</div>
          </div>
        </div>
      )}

      {/* Filters + Search */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-6">
        <div className="flex gap-2 bg-secondary/50 p-1.5 rounded-xl inline-flex">
          {(["all", "pending", "approved", "rejected", "reconciled", "annulled"] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${filter === tab ? 'bg-background shadow text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-background/50'}`}
              data-testid={`filter-tab-${tab}`}
            >
              {tab === "all" ? "Todas" : statusLabels[tab]}
            </button>
          ))}
        </div>
        <div className="relative w-full sm:w-auto sm:min-w-[260px] sm:ml-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            type="search"
            placeholder="Buscar por donante, email, campaña..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 rounded-xl bg-background"
            aria-label="Buscar donaciones"
          />
        </div>
      </div>

      <Dialog open={manualOpen} onOpenChange={(open) => { setManualOpen(open); if (!open) setManualError(""); }}>
        <DialogContent className="rounded-2xl sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Registrar aporte coordinado</DialogTitle>
            <DialogDescription>
              Usa este formulario cuando el aporte se haya coordinado por WhatsApp o se haya recibido directamente.
              Se guardará como pendiente hasta que el equipo lo revise.
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void handleManualSubmit(); }}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-sm font-medium">Nombres
                <Input required minLength={2} value={manualForm.firstName} onChange={(e) => setManualForm({ ...manualForm, firstName: e.target.value })} />
              </label>
              <label className="space-y-1 text-sm font-medium">Apellidos
                <Input required minLength={2} value={manualForm.lastName} onChange={(e) => setManualForm({ ...manualForm, lastName: e.target.value })} />
              </label>
              <label className="space-y-1 text-sm font-medium">Correo (opcional)
                <Input type="email" value={manualForm.email} onChange={(e) => setManualForm({ ...manualForm, email: e.target.value })} placeholder="correo@ejemplo.com" />
              </label>
              <label className="space-y-1 text-sm font-medium">WhatsApp (opcional)
                <Input value={manualForm.phone} onChange={(e) => setManualForm({ ...manualForm, phone: e.target.value })} placeholder="9 dígitos" />
              </label>
              <label className="space-y-1 text-sm font-medium">Tipo de aporte
                <select className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm" value={manualForm.collaborationType} onChange={(e) => setManualForm({ ...manualForm, collaborationType: e.target.value })}>
                  <option value="dinero">Dinero</option>
                  <option value="productos">Productos</option>
                </select>
              </label>
              {manualForm.collaborationType === "dinero" ? (
                <label className="space-y-1 text-sm font-medium">Monto recibido (S/)
                  <Input type="number" min="5" step="0.01" required value={manualForm.amount} onChange={(e) => setManualForm({ ...manualForm, amount: e.target.value })} />
                </label>
              ) : (
                <>
                  <label className="space-y-1 text-sm font-medium">Producto
                    <select className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm" value={manualForm.product} onChange={(e) => setManualForm({ ...manualForm, product: e.target.value })}>
                      <option value="panetones">Panetones</option><option value="leche">Leche</option>
                      <option value="chocolate">Chocolate</option><option value="arroz">Arroz</option>
                      <option value="azucar">Azúcar</option><option value="aceite">Aceite</option>
                      <option value="juguetes">Juguetes</option><option value="ropa">Ropa</option>
                      <option value="otros">Otros</option>
                    </select>
                  </label>
                  <label className="space-y-1 text-sm font-medium">Cantidad y unidad
                    <div className="flex gap-2">
                      <Input type="number" min="0.001" step="0.001" required value={manualForm.quantity} onChange={(e) => setManualForm({ ...manualForm, quantity: e.target.value })} />
                      <select className="h-10 rounded-xl border border-input bg-background px-3 text-sm" value={manualForm.unit} onChange={(e) => setManualForm({ ...manualForm, unit: e.target.value })}>
                        <option value="unidad">Unidad</option><option value="caja">Caja</option>
                        <option value="paquete">Paquete</option><option value="saco">Saco</option>
                        <option value="kilogramo">Kilogramo</option><option value="litro">Litro</option>
                      </select>
                    </div>
                  </label>
                  {manualForm.product === "otros" && (
                    <label className="space-y-1 text-sm font-medium">Describe el producto
                      <Input required minLength={2} maxLength={60} value={manualForm.productOther} onChange={(e) => setManualForm({ ...manualForm, productOther: e.target.value })} />
                    </label>
                  )}
                  <label className="space-y-1 text-sm font-medium">Valor estimado (S/, opcional)
                    <Input type="number" min="0" step="0.01" value={manualForm.estimatedValue} onChange={(e) => setManualForm({ ...manualForm, estimatedValue: e.target.value })} />
                  </label>
                </>
              )}
              {manualForm.collaborationType === "dinero" && (
              <label className="space-y-1 text-sm font-medium">Medio de recepción
                <select className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm" value={manualForm.paymentMethod} onChange={(e) => setManualForm({ ...manualForm, paymentMethod: e.target.value })}>
                  <option value="cash">Efectivo</option>
                  <option value="other">Otro / coordinado</option>
                  <option value="yape">Yape</option>
                  <option value="plin">Plin</option>
                  <option value="transfer">Transferencia</option>
                </select>
              </label>
              )}
              <label className="space-y-1 text-sm font-medium sm:col-span-2">Campaña (opcional)
                <select className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm" value={manualForm.campaignId} onChange={(e) => setManualForm({ ...manualForm, campaignId: e.target.value })}>
                  <option value="">Fondo general</option>
                  {manualCampaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.title}</option>)}
                </select>
              </label>
              <label className="space-y-1 text-sm font-medium sm:col-span-2">Nota interna (opcional)
                <Textarea rows={2} value={manualForm.message} onChange={(e) => setManualForm({ ...manualForm, message: e.target.value })} placeholder="Detalle útil para el equipo" />
              </label>
            </div>
            <p className="text-xs text-muted-foreground">
              Los aportes digitales quedarán pendientes hasta que adjuntes el comprobante y los apruebes.
              Sin correo se guarda un identificador interno, no se publica en la página.
            </p>
            {manualError && <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{manualError}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setManualOpen(false)} className="rounded-xl">Cancelar</Button>
              <Button type="submit" disabled={manualSaving} className="rounded-xl">
                {manualSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Guardar como pendiente
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={!!rejectDialogId} onOpenChange={(open) => !open && setRejectDialogId(null)}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>Rechazar Donación</DialogTitle>
            <DialogDescription>
              Por favor, indica el motivo del rechazo. Esta nota será visible para los administradores.
            </DialogDescription>
          </DialogHeader>
          <Textarea 
            value={rejectNote} 
            onChange={(e) => setRejectNote(e.target.value)} 
            placeholder="Ej: El voucher no es válido, no corresponde al monto, etc."
            className="min-h-[100px] rounded-xl mt-4"
          />
          <DialogFooter className="mt-6">
            <Button variant="outline" onClick={() => setRejectDialogId(null)} className="rounded-xl">Cancelar</Button>
            <Button variant="destructive" onClick={handleReject} disabled={!rejectNote.trim() || updateStatus.isPending} className="rounded-xl">Confirmar Rechazo</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Adjuntar Comprobante Dialog (soporte admin: el comprobante es opcional) */}
      <Dialog open={!!proofUploadId} onOpenChange={(open) => !open && setProofUploadId(null)}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>Adjuntar Comprobante</DialogTitle>
            <DialogDescription>
              Sube la captura de pago (Yape/Plin/transferencia) de esta donación. Es opcional: si no se adjunta, la donación igual puede aprobarse.
            </DialogDescription>
          </DialogHeader>
          <input
            ref={proofFileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="block w-full text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:bg-accent file:text-accent-foreground file:text-sm file:font-semibold hover:file:bg-accent/90 cursor-pointer"
            disabled={proofUploading}
            data-testid="proof-file-input"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file && typeof proofUploadId === "number") handleAttachProofFile(proofUploadId, file);
            }}
          />
          {proofUploading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" /> Subiendo imagen…
            </div>
          )}
          <DialogFooter className="mt-6">
            <Button
              variant="outline"
              className="rounded-xl"
              disabled={proofUploading}
              onClick={() => {
                setProofUploadId(null);
                if (proofFileRef.current) proofFileRef.current.value = "";
              }}
            >
              Cancelar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Image Preview Dialog */}
      <Dialog open={!!receiptImage} onOpenChange={() => setReceiptImage(null)}>
        <DialogContent className="max-w-2xl bg-transparent border-none shadow-none">
          {receiptImage && <img src={receiptImage} alt="Comprobante" loading="lazy" decoding="async" className="w-full rounded-2xl" />}
        </DialogContent>
      </Dialog>

      {/* Table */}
      <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden" data-testid="donations-table">
        <Table>
          <TableHeader className="bg-secondary/30">
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Donante</TableHead>
              <TableHead>Campaña</TableHead>
              <TableHead>Monto / Método</TableHead>
              <TableHead>Comprobante</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-12 text-muted-foreground">Cargando donaciones...</TableCell></TableRow>
            ) : filteredDonations.length > 0 ? (
              filteredDonations.map((d, i) => (
                // Fallback indexado: donaciones stale sin id no deben producir key={undefined}
                <TableRow key={d.id ?? `stale-${i}`}>
                  <TableCell className="text-sm whitespace-nowrap text-muted-foreground">
                    {formatDate(d.createdAt)}
                  </TableCell>
                  <TableCell>
                    {d.anonymous ? (
                      <span className="font-medium italic text-muted-foreground">Donante Anónimo</span>
                    ) : (
                      <div>
                        <div className="font-medium text-foreground">{d.firstName} {d.lastName}</div>
                        <div className="text-xs text-muted-foreground">{d.email}</div>
                        {d.phone && <div className="text-xs text-muted-foreground">{d.phone}</div>}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    {d.campaignId ? (
                      <span className="text-sm font-medium">{d.campaignTitle || `Campaña #${d.campaignId}`}</span>
                    ) : (
                      <span className="text-sm text-muted-foreground">Fondo General</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {/* En especie no hay importe cobrado: se muestra el valor
                        estimado (si lo declararon) o que no hay ninguno. */}
                    {isMoneyCollaboration(d.collaborationType) ? (
                      <div className="font-bold text-foreground">
                        S/ {Number(d.amount ?? 0).toLocaleString()}
                      </div>
                    ) : Number(d.amount ?? 0) > 0 ? (
                      <div className="font-bold text-foreground">
                        S/ {Number(d.amount).toLocaleString()}{" "}
                        <span className="text-xs font-normal text-muted-foreground">est.</span>
                      </div>
                    ) : (
                      <div className="font-medium text-muted-foreground">Sin valor estimado</div>
                    )}
                    <Badge variant="outline" className="text-[10px] mt-1 px-1.5">
                      {isMoneyCollaboration(d.collaborationType) ? (
                        <span className="uppercase">{d.paymentMethod}</span>
                      ) : (
                        collaborationTypeLabel(d.collaborationType)
                      )}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1 items-start">
                      {d.receiptUrl ? (
                        <>
                          <Button variant="secondary" size="sm" className="h-7 text-xs rounded-lg" onClick={() => setReceiptImage(d.receiptUrl!)}>
                            <ImageIcon className="w-3 h-3 mr-1" /> Ver Imagen
                          </Button>
                          {d.publicProof ? (
                            <Badge variant="outline" className="text-[10px] text-green-700 border-green-200 bg-green-50 px-1.5">
                              Recibo público
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] text-muted-foreground px-1.5">
                              Recibo privado
                            </Badge>
                          )}
                        </>
                      ) : d.receiptNote ? (
                        <div className="text-xs bg-secondary/50 p-1.5 rounded text-muted-foreground max-w-[150px] truncate" title={d.receiptNote}>
                          📝 {d.receiptNote}
                        </div>
                      ) : (
                        <div className="flex flex-col gap-1 items-start">
                          <span className="text-xs text-muted-foreground italic">Sin adjunto</span>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs rounded-lg"
                            onClick={() => setProofUploadId(d.id)}
                            disabled={proofUploading}
                            data-testid="btn-attach-proof"
                          >
                            <UploadCloud className="w-3 h-3 mr-1" /> Adjuntar
                          </Button>
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge className={`${statusColors[d.status]} border-0 shadow-sm`}>
                      {statusLabels[d.status]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button 
                        size="icon" 
                        variant="outline" 
                        className="h-10 w-10 text-accent border-accent/20 hover:bg-accent/10 hover:text-accent rounded-lg"
                        disabled={d.status === 'approved' || updateStatus.isPending}
                        onClick={() => handleApprove(d.id)}
                        title="Aprobar"
                        data-testid="btn-approve-donation"
                      >
                        <CheckCircle className="w-4 h-4" />
                      </Button>
                      <Button 
                        size="icon" 
                        variant="outline" 
                        className="h-10 w-10 text-destructive border-destructive/20 hover:bg-destructive/10 hover:text-destructive rounded-lg"
                        disabled={d.status === 'rejected' || updateStatus.isPending}
                        onClick={() => setRejectDialogId(d.id)}
                        title="Rechazar"
                        data-testid="btn-reject-donation"
                      >
                        <XCircle className="w-4 h-4" />
                      </Button>
                      {d.status === 'approved' && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-10 rounded-lg text-emerald-600 border-emerald-600/20 hover:bg-emerald-600/10 hover:text-emerald-700"
                          disabled={reconcile.isPending}
                          onClick={() => reconcile.mutate(d.id)}
                          title="Conciliar con el banco"
                          data-testid="btn-reconcile-donation"
                        >
                          {reconcile.isPending && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
                          Conciliar
                        </Button>
                      )}
                      {/* Anular contablemente (solo superadmin y solo si está
                          confirmada): no borra, compensa en el libro. */}
                      <DonationVoidAction
                        donation={{
                          id: d.id,
                          title: `${d.firstName} ${d.lastName}`.trim() || "Donación",
                          amount: Number(d.amount) || 0,
                          status: d.status,
                          campaignId: d.campaignId ?? null,
                        }}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow><TableCell colSpan={7} className="text-center py-12 text-muted-foreground">No se encontraron donaciones.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

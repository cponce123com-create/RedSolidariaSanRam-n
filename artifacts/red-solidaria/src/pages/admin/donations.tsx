import { useState } from "react";
import { 
  useGetDonations, 
  useUpdateDonationStatus, 
  useGetDonationStats 
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { CheckCircle, XCircle, Search, ExternalLink, Image as ImageIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

type FilterStatus = "all" | "pending" | "approved" | "rejected";

export default function AdminDonations() {
  const [filter, setFilter] = useState<FilterStatus>("all");
  const [rejectDialogId, setRejectDialogId] = useState<number | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [receiptImage, setReceiptImage] = useState<string | null>(null);

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const updateStatus = useUpdateDonationStatus();

  // Fetch stats unconditionally
  const { data: stats } = useGetDonationStats();

  // Fetch filtered donations
  const apiFilterStatus = filter === "all" ? undefined : filter;
  const { data: donations, isLoading } = useGetDonations(
    apiFilterStatus ? { status: apiFilterStatus } : undefined
  );

  const handleApprove = (id: number) => {
    updateStatus.mutate(
      { id, data: { status: "approved" } },
      {
        onSuccess: () => {
          toast({ title: "Donación aprobada", description: "El estado ha sido actualizado." });
          queryClient.invalidateQueries({ queryKey: ["/api/donations"] });
          queryClient.invalidateQueries({ queryKey: ["/api/donations/stats"] });
        }
      }
    );
  };

  const handleReject = () => {
    if (!rejectDialogId) return;
    updateStatus.mutate(
      { id: rejectDialogId, data: { status: "rejected", adminNote: rejectNote } },
      {
        onSuccess: () => {
          toast({ title: "Donación rechazada", description: "Se guardó la nota de rechazo." });
          queryClient.invalidateQueries({ queryKey: ["/api/donations"] });
          queryClient.invalidateQueries({ queryKey: ["/api/donations/stats"] });
          setRejectDialogId(null);
          setRejectNote("");
        }
      }
    );
  };

  const statusColors = {
    pending: "bg-yellow-500 hover:bg-yellow-600 text-white",
    approved: "bg-accent hover:bg-accent text-white",
    rejected: "bg-destructive hover:bg-destructive text-white"
  };

  const statusLabels = {
    pending: "Pendiente",
    approved: "Aprobada",
    rejected: "Rechazada"
  };

  return (
    <div className="p-8 max-w-[1400px] mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold font-display">Gestión de Donaciones</h1>
        <p className="text-muted-foreground mt-1">Revisa, aprueba y administra las donaciones recibidas.</p>
      </div>

      {/* Stats Row */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-card border border-border p-5 rounded-2xl shadow-sm">
            <div className="text-sm font-medium text-muted-foreground mb-1">Total Recaudado</div>
            <div className="text-2xl font-bold text-foreground">S/ {stats.totalAmount.toLocaleString()}</div>
          </div>
          <div className="bg-card border border-border p-5 rounded-2xl shadow-sm">
            <div className="text-sm font-medium text-muted-foreground mb-1">Total Donaciones</div>
            <div className="text-2xl font-bold text-foreground">{stats.totalDonations}</div>
          </div>
          <div className="bg-card border-l-4 border-yellow-500 p-5 rounded-2xl shadow-sm">
            <div className="text-sm font-medium text-muted-foreground mb-1">Pendientes</div>
            <div className="text-2xl font-bold text-yellow-600">{stats.pendingCount}</div>
          </div>
          <div className="bg-card border-l-4 border-accent p-5 rounded-2xl shadow-sm">
            <div className="text-sm font-medium text-muted-foreground mb-1">Aprobadas</div>
            <div className="text-2xl font-bold text-accent">{stats.approvedCount}</div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-2 mb-6 bg-secondary/50 p-1.5 rounded-xl inline-flex">
        {(["all", "pending", "approved", "rejected"] as const).map(tab => (
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

      {/* Image Preview Dialog */}
      <Dialog open={!!receiptImage} onOpenChange={() => setReceiptImage(null)}>
        <DialogContent className="max-w-2xl bg-transparent border-none shadow-none">
          {receiptImage && <img src={receiptImage} alt="Comprobante" className="w-full rounded-2xl" />}
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
            ) : donations && donations.length > 0 ? (
              donations.map(d => (
                <TableRow key={d.id}>
                  <TableCell className="text-sm whitespace-nowrap text-muted-foreground">
                    {format(new Date(d.createdAt), "dd/MM/yy HH:mm")}
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
                    <div className="font-bold text-foreground">S/ {d.amount.toLocaleString()}</div>
                    <Badge variant="outline" className="text-[10px] mt-1 uppercase px-1.5">{d.paymentMethod}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1 items-start">
                      {d.receiptUrl ? (
                        <Button variant="secondary" size="sm" className="h-7 text-xs rounded-lg" onClick={() => setReceiptImage(d.receiptUrl!)}>
                          <ImageIcon className="w-3 h-3 mr-1" /> Ver Imagen
                        </Button>
                      ) : d.receiptNote ? (
                        <div className="text-xs bg-secondary/50 p-1.5 rounded text-muted-foreground max-w-[150px] truncate" title={d.receiptNote}>
                          📝 {d.receiptNote}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground italic">Sin adjunto</span>
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
                        className="h-8 w-8 text-accent border-accent/20 hover:bg-accent/10 hover:text-accent rounded-lg"
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
                        className="h-8 w-8 text-destructive border-destructive/20 hover:bg-destructive/10 hover:text-destructive rounded-lg"
                        disabled={d.status === 'rejected' || updateStatus.isPending}
                        onClick={() => setRejectDialogId(d.id)}
                        title="Rechazar"
                        data-testid="btn-reject-donation"
                      >
                        <XCircle className="w-4 h-4" />
                      </Button>
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

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Award, Copy, Loader2, Plus, QrCode, RefreshCw, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { formatSafeDate } from "@/lib/i18n/date";

/**
 * Certificados con QR (Fase 5.2 / B-3): emisión, corrección y revocación.
 *
 * El código público lo genera SIEMPRE el servidor; aquí solo se muestra y se
 * copia el enlace para compartir. Revocar exige motivo: sin él, la revocación no
 * es trazable, así que el diálogo no deja enviarla vacía.
 */
const CERTIFICATE_TYPES = [
  "donante",
  "voluntario",
  "auspiciador",
  "colaborador",
  "reconocimiento",
] as const;

interface AdminCertificate {
  id: number;
  code: string;
  holderName: string;
  type: string;
  title: string;
  description: string | null;
  campaignId: number | null;
  issuedAt: string;
  status: string;
  revokedAt: string | null;
  revocationReason: string | null;
  createdAt: string;
}

async function fetchCertificates(): Promise<AdminCertificate[]> {
  const res = await fetch("/api/admin/certificates", { credentials: "include" });
  if (!res.ok) throw new Error("No se pudieron cargar los certificados");
  return res.json();
}

export default function AdminCertificates() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [createOpen, setCreateOpen] = useState(false);
  const [holderName, setHolderName] = useState("");
  const [type, setType] = useState<string>("donante");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [issuedAt, setIssuedAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [revokeId, setRevokeId] = useState<number | null>(null);
  const [revokeReason, setRevokeReason] = useState("");

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["admin-certificates"],
    queryFn: fetchCertificates,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["admin-certificates"] });

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/certificates", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          holderName: holderName.trim(),
          type,
          title: title.trim(),
          description: description.trim() || null,
          issuedAt,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.message ?? "No se pudo emitir el certificado");
      }
      return res.json() as Promise<AdminCertificate>;
    },
    onSuccess: (created) => {
      toast({
        title: "Certificado emitido",
        description: `Código público: ${created.code}. Compártelo con el enlace o el QR.`,
      });
      setCreateOpen(false);
      setHolderName("");
      setTitle("");
      setDescription("");
      setType("donante");
      void invalidate();
    },
    onError: (error: Error) =>
      toast({ title: "No se pudo emitir", description: error.message, variant: "destructive" }),
  });

  const revokeMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/admin/certificates/${revokeId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "revoked", revocationReason: revokeReason.trim() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.message ?? "No se pudo revocar el certificado");
      }
      return res.json() as Promise<AdminCertificate>;
    },
    onSuccess: () => {
      toast({ title: "Certificado revocado", description: "Ya no se publica en su enlace público." });
      setRevokeId(null);
      setRevokeReason("");
      void invalidate();
    },
    onError: (error: Error) =>
      toast({ title: "No se pudo revocar", description: error.message, variant: "destructive" }),
  });

  const copyLink = async (code: string) => {
    const url = `${window.location.origin}/certificados/${code}`;
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: "Enlace copiado", description: url });
    } catch {
      toast({ title: "Copia manualmente", description: url, variant: "destructive" });
    }
  };

  const certificates = data ?? [];
  const canSubmit = holderName.trim().length > 1 && title.trim().length > 2;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold flex items-center gap-2">
            <Award className="w-6 h-6 text-primary" aria-hidden />
            Certificados
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Reconocimientos con QR. El enlace público solo muestra el nombre autorizado, el tipo,
            el título, la fecha y la campaña: nunca el importe ni datos de contacto.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="gap-2 rounded-xl h-11"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            {isFetching ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Actualizar
          </Button>
          <Button className="gap-2 rounded-xl h-11" onClick={() => setCreateOpen(true)}>
            <Plus className="w-4 h-4" aria-hidden />
            Emitir certificado
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Emitidos ({certificates.length})</CardTitle>
          <CardDescription>
            Un certificado revocado deja de publicarse (su enlace responde «no encontrado»).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading && (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <Loader2 className="w-6 h-6 animate-spin" aria-hidden />
            </div>
          )}

          {isError && (
            <p className="text-sm text-destructive py-8 text-center">
              No se pudieron cargar los certificados.
            </p>
          )}

          {!isLoading && !isError && certificates.length === 0 && (
            <p className="text-sm text-muted-foreground py-8 text-center">
              Todavía no hay certificados. Emite el primero con «Emitir certificado».
            </p>
          )}

          {!isLoading && !isError && certificates.length > 0 && (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Titular</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Código</TableHead>
                    <TableHead>Emitido</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {certificates.map((cert) => (
                    <TableRow key={cert.id} data-testid={`certificate-row-${cert.id}`}>
                      <TableCell className="font-medium">{cert.holderName}</TableCell>
                      <TableCell>{t(`certificate.type.${cert.type}`, { defaultValue: cert.type })}</TableCell>
                      <TableCell className="font-mono text-xs">{cert.code}</TableCell>
                      <TableCell>{formatSafeDate(cert.issuedAt, "es-PE")}</TableCell>
                      <TableCell>
                        {cert.status === "issued" ? (
                          <Badge variant="secondary">Vigente</Badge>
                        ) : (
                          <Badge variant="outline">Revocado</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="gap-1"
                            onClick={() => copyLink(cert.code)}
                            title="Copiar enlace público"
                          >
                            <Copy className="w-4 h-4" aria-hidden />
                            Enlace
                          </Button>
                          <a
                            href={`/certificados/${cert.code}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex"
                          >
                            <Button variant="ghost" size="sm" className="gap-1" title="Ver como lo ve el titular">
                              <QrCode className="w-4 h-4" aria-hidden />
                              Ver
                            </Button>
                          </a>
                          {cert.status === "issued" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="gap-1 text-destructive"
                              onClick={() => setRevokeId(cert.id)}
                            >
                              <XCircle className="w-4 h-4" aria-hidden />
                              Revocar
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Emitir */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Emitir certificado</DialogTitle>
            <DialogDescription>
              El código público lo genera el sistema. Comprueba el nombre tal como quieres que se
              publique: es lo único que verá quien abra el enlace.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="holderName">Nombre autorizado a publicar</Label>
              <Input
                id="holderName"
                value={holderName}
                onChange={(event) => setHolderName(event.target.value)}
                placeholder="Nombre de la persona o entidad"
                maxLength={160}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="type">Tipo</Label>
                <select
                  id="type"
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                  value={type}
                  onChange={(event) => setType(event.target.value)}
                >
                  {CERTIFICATE_TYPES.map((option) => (
                    <option key={option} value={option}>
                      {t(`certificate.type.${option}`, { defaultValue: option })}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="issuedAt">Fecha</Label>
                <Input
                  id="issuedAt"
                  type="date"
                  value={issuedAt}
                  onChange={(event) => setIssuedAt(event.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="title">Título</Label>
              <Input
                id="title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Certificado de agradecimiento"
                maxLength={160}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Descripción (opcional)</Label>
              <Input
                id="description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Por su aporte a la campaña…"
                maxLength={600}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={!canSubmit || createMutation.isPending}
              data-testid="certificate-create-submit"
            >
              {createMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" aria-hidden />}
              Emitir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Revocar */}
      <Dialog open={revokeId !== null} onOpenChange={(open) => !open && setRevokeId(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Revocar certificado</DialogTitle>
            <DialogDescription>
              Dejará de publicarse en su enlace. El motivo queda registrado: una revocación sin
              justificación no es trazable.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="revokeReason">Motivo</Label>
            <Input
              id="revokeReason"
              value={revokeReason}
              onChange={(event) => setRevokeReason(event.target.value)}
              placeholder="Emitido por error en el nombre"
              maxLength={300}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRevokeId(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => revokeMutation.mutate()}
              disabled={revokeReason.trim().length < 5 || revokeMutation.isPending}
            >
              {revokeMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" aria-hidden />}
              Revocar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

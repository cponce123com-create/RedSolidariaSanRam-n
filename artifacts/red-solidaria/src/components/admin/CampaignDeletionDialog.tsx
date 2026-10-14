import { useEffect, useState } from "react";
import { useGetAdminMe } from "@workspace/api-client-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCampaignDeletionDiagnostic, useCampaignLifecycle } from "@/hooks/use-campaign-lifecycle";
import {
  campaignStatusBadge,
  campaignStatusLabel,
  canPurgeTestData,
  deletionHeadline,
  describeDependencies,
  errorMessage,
  groupDependencies,
  totalOf,
  type DeletionDependency,
} from "@/lib/campaign-admin";
import { AlertTriangle, Archive, FlaskConical, Loader2, ShieldCheck, Trash2 } from "lucide-react";

interface CampaignDeletionDialogProps {
  campaignId: number | null;
  title: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Diálogo de gestión del borrado de una campaña (V7.1 · Fase 1.4).
 *
 * Antes de confirmar, carga el DIAGNÓSTICO del servidor y muestra: qué
 * dependencias existen y su naturaleza, qué se eliminaría, qué se conservaría y
 * el motivo concreto por el que una operación no está disponible. El botón
 * Eliminar solo aparece habilitado cuando el servidor lo permite; si no, se
 * ofrece Archivar. Los mensajes de error son los REALES del servidor.
 */
export function CampaignDeletionDialog({
  campaignId,
  title,
  open,
  onOpenChange,
}: CampaignDeletionDialogProps) {
  const { data: adminUser } = useGetAdminMe({ query: { queryKey: ["/api/admin/me"], retry: false } });
  const { data, isLoading, isError, error } = useCampaignDeletionDiagnostic(open ? campaignId : null);
  const { remove, setStatus, purgeTestData } = useCampaignLifecycle();
  const [purgeReason, setPurgeReason] = useState("");

  useEffect(() => {
    if (!open) setPurgeReason("");
  }, [open]);

  const diagnostic = data?.diagnostic;
  const grouped = diagnostic ? groupDependencies(diagnostic.dependencies) : null;
  const busy = remove.isPending || setStatus.isPending || purgeTestData.isPending;
  const canPurge =
    diagnostic !== undefined && canPurgeTestData(diagnostic, adminUser?.role ?? null);

  const close = () => onOpenChange(false);

  const handleDelete = () => {
    if (!campaignId) return;
    remove.mutate(campaignId, { onSuccess: close });
  };

  const handleArchive = () => {
    if (!campaignId) return;
    setStatus.mutate({ id: campaignId, status: "archived" }, { onSuccess: close });
  };

  const handlePurge = () => {
    if (!campaignId) return;
    purgeTestData.mutate({ id: campaignId, reason: purgeReason.trim() }, { onSuccess: close });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] rounded-3xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-display">
            {diagnostic ? deletionHeadline(diagnostic) : "Gestionar campaña"}
          </DialogTitle>
          <DialogDescription>
            «{title}» · estado {campaignStatusLabel(data?.status ?? "")}
          </DialogDescription>
        </DialogHeader>

        {isLoading && (
          <div className="flex items-center gap-2 py-6 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Analizando dependencias…
          </div>
        )}

        {isError && (
          <div
            role="alert"
            className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
          >
            {errorMessage(error, "No se pudo analizar la campaña.")}
          </div>
        )}

        {diagnostic && (
          <div className="space-y-4">
            {data?.status && (
              <Badge className={`${campaignStatusBadge(data.status)} border-0 shadow-sm px-3`}>
                {campaignStatusLabel(data.status)}
              </Badge>
            )}

            {diagnostic.blockedReason && (
              <div
                role="alert"
                className="flex gap-2 rounded-xl border border-amber-300/60 bg-amber-50 p-3 text-sm text-amber-900"
              >
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{diagnostic.blockedReason}</span>
              </div>
            )}

            {diagnostic.total === 0 ? (
              <p className="text-sm text-muted-foreground">
                Sin registros asociados: el borrado definitivo no afecta a ningún otro dato.
              </p>
            ) : (
              <div className="space-y-3 text-sm">
                {grouped!.protected.length > 0 && (
                  <DependencyGroup
                    title={`Se conservarán · ${totalOf(grouped!.protected)} (impiden el borrado)`}
                    tone="protected"
                    items={grouped!.protected}
                  />
                )}
                {grouped!.removed.length > 0 && (
                  <DependencyGroup
                    title={`Se eliminarán · ${totalOf(grouped!.removed)}`}
                    tone="removed"
                    items={grouped!.removed}
                  />
                )}
                {grouped!.unlinked.length > 0 && (
                  <DependencyGroup
                    title={`Se desvincularán (no se borran) · ${totalOf(grouped!.unlinked)}`}
                    tone="unlinked"
                    items={grouped!.unlinked}
                  />
                )}
              </div>
            )}

            {canPurge && (
              <div className="rounded-xl border border-border p-3 space-y-2">
                <p className="text-sm font-medium flex items-center gap-2">
                  <FlaskConical className="w-4 h-4" /> Purga de datos de prueba
                </p>
                <p className="text-xs text-muted-foreground">
                  Borra los datos NO contables del borrador (incluidas donaciones no confirmadas).
                  Se rechaza si hay asientos, gastos o donaciones confirmadas. Queda en la auditoría.
                </p>
                <Input
                  value={purgeReason}
                  onChange={(e) => setPurgeReason(e.target.value)}
                  placeholder="Motivo (mínimo 10 caracteres)"
                  className="rounded-xl"
                  aria-label="Motivo de la purga"
                />
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" className="rounded-xl" onClick={close} disabled={busy}>
            Cancelar
          </Button>
          {diagnostic?.canArchive && (
            <Button variant="outline" className="rounded-xl gap-2" onClick={handleArchive} disabled={busy}>
              <Archive className="w-4 h-4" /> Archivar
            </Button>
          )}
          {canPurge && (
            <Button
              variant="outline"
              className="rounded-xl gap-2 text-amber-700 border-amber-300 hover:bg-amber-50"
              onClick={handlePurge}
              disabled={busy || purgeReason.trim().length < 10}
            >
              {purgeTestData.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <ShieldCheck className="w-4 h-4" />
              )}
              Purgar datos de prueba
            </Button>
          )}
          <Button
            variant="destructive"
            className="rounded-xl gap-2"
            onClick={handleDelete}
            disabled={busy || !diagnostic?.canDelete}
            title={diagnostic?.canDelete ? undefined : "El servidor no permite eliminar esta campaña"}
          >
            {remove.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            Eliminar definitivamente
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DependencyGroup({
  title,
  tone,
  items,
}: {
  title: string;
  tone: "protected" | "removed" | "unlinked";
  items: DeletionDependency[];
}) {
  const toneClass =
    tone === "protected"
      ? "text-amber-800"
      : tone === "removed"
        ? "text-destructive"
        : "text-muted-foreground";
  return (
    <div>
      <p className={`text-xs font-semibold uppercase tracking-wide ${toneClass}`}>{title}</p>
      <ul className="mt-1 list-disc pl-5 text-muted-foreground">
        {items.map((item) => (
          <li key={item.key}>
            {item.count} {item.label}
          </li>
        ))}
      </ul>
      <span className="sr-only">{describeDependencies(items)}</span>
    </div>
  );
}

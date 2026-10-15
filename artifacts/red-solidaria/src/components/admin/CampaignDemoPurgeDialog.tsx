import { useEffect, useState } from "react";
import { Link } from "wouter";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  useCampaignLifecycle,
  useDemoPurge,
  useDemoPurgePreview,
} from "@/hooks/use-campaign-lifecycle";
import {
  MIN_DEMO_REASON,
  blockerSummary,
  campaignStatusBadge,
  campaignStatusLabel,
  canPurgeDemoCampaign,
  demoPurgeHeadline,
  demoPurgeSummary,
  describeLedger,
  errorMessage,
  identifierMatches,
  needsDemoMarking,
  totalOfPlan,
} from "@/lib/campaign-admin";
import { AlertTriangle, Archive, Loader2, ShieldCheck, Trash2 } from "lucide-react";

interface CampaignDemoPurgeDialogProps {
  campaignId: number | null;
  title: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * «Más acciones → Eliminar campaña DEMO» (V7.2).
 *
 * Flujo en tres pasos, todos exigidos por el servidor:
 *
 *  1. ANÁLISIS: nombre, identificador, estado, recuento y tipos de registros
 *     relacionados, estado del libro contable y veredicto de seguridad. Si algo
 *     impide la purga, se explica por qué y se ofrece archivar o anular
 *     contablemente en vez de destruir.
 *  2. DECLARACIÓN DEMO (solo si falta): afirmación explícita del superadmin, con
 *     reautenticación y motivo. La marca es necesaria pero NO suficiente.
 *  3. CONFIRMACIÓN: motivo, reautenticación (contraseña y, si procede, 2FA),
 *     identificador de la campaña escrito a mano y acuse de irreversibilidad.
 *
 * Nada se elimina sin que el servidor lo vuelva a comprobar dentro de la
 * transacción: este diálogo informa y recoge la confirmación, no decide.
 */
export function CampaignDemoPurgeDialog({
  campaignId,
  title,
  open,
  onOpenChange,
}: CampaignDemoPurgeDialogProps) {
  const { data: adminUser } = useGetAdminMe({
    query: { queryKey: ["/api/admin/me"], retry: false },
  });
  const role = adminUser?.role ?? null;
  const { data: analysis, isLoading, isError, error } = useDemoPurgePreview(
    open ? campaignId : null,
  );
  const { mark, purge } = useDemoPurge();
  const { setStatus } = useCampaignLifecycle();

  const [reason, setReason] = useState("");
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);

  useEffect(() => {
    if (!open) {
      setReason("");
      setPassword("");
      setTotpCode("");
      setIdentifier("");
      setAcknowledged(false);
    }
  }, [open]);

  const busy = mark.isPending || purge.isPending || setStatus.isPending;
  const verdict = analysis?.verdict;
  const summary = demoPurgeSummary(verdict);
  const blocker = blockerSummary(verdict?.blockers);
  const canPurge = canPurgeDemoCampaign(analysis, role);
  const mustMark = needsDemoMarking(analysis);
  const reasonOk = reason.trim().length >= MIN_DEMO_REASON;
  const identifierOk = campaignId !== null && identifierMatches(identifier, campaignId);

  const close = () => onOpenChange(false);

  const handleMark = () => {
    if (!campaignId) return;
    mark.mutate(
      { id: campaignId, reason: reason.trim(), password, totpCode: totpCode || undefined },
      { onSuccess: () => setReason("") },
    );
  };

  const handlePurge = () => {
    if (!campaignId) return;
    purge.mutate(
      {
        id: campaignId,
        identifier: identifier.trim(),
        reason: reason.trim(),
        password,
        totpCode: totpCode || undefined,
      },
      { onSuccess: close },
    );
  };

  const handleArchive = () => {
    if (!campaignId) return;
    setStatus.mutate({ id: campaignId, status: "archived" }, { onSuccess: close });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[620px] rounded-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-display flex items-center gap-2">
            <Trash2 className="w-5 h-5 text-destructive" />
            {demoPurgeHeadline(analysis)}
          </DialogTitle>
          <DialogDescription>
            «{analysis?.campaign.title ?? title}» · identificador {campaignId ?? "—"}
            {analysis?.campaign.isDemo ? " · declarada DEMO" : ""}
          </DialogDescription>
        </DialogHeader>

        {isLoading && (
          <div className="flex items-center gap-2 py-6 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Analizando los datos de la campaña…
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

        {analysis && verdict && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className={`${campaignStatusBadge(analysis.campaign.status)} border-0 shadow-sm px-3`}>
                {campaignStatusLabel(analysis.campaign.status)}
              </Badge>
              {analysis.campaign.isDemo && (
                <Badge variant="outline" className="border-amber-300 text-amber-800">
                  DEMO
                </Badge>
              )}
              {analysis.campaign.demoMarkedBy && (
                <span className="text-xs text-muted-foreground">
                  declarada por {analysis.campaign.demoMarkedBy}
                </span>
              )}
            </div>

            <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
              <SummaryTile label="Registros a eliminar" value={summary.deletableRows} />
              <SummaryTile label="Tipos afectados" value={summary.deletableTables} />
              <SummaryTile label="Se desvinculan" value={summary.unlinkedRows} />
              <SummaryTile label="Asientos del libro" value={analysis.ledger.movementCount} />
            </dl>

            {blocker && (
              <div
                role="alert"
                className="flex gap-2 rounded-xl border border-amber-300/60 bg-amber-50 p-3 text-sm text-amber-900"
              >
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <div className="space-y-1">
                  <span className="block">{blocker}</span>
                  {mustMark && (
                    <span className="block">
                      La declaración DEMO es una afirmación explícita del superadministrador: no
                      basta con que el nombre lo sugiera. El análisis de seguridad se vuelve a
                      aplicar después.
                    </span>
                  )}
                </div>
              </div>
            )}

            <div className="space-y-2 text-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-destructive">
                Se eliminará definitivamente · {summary.deletableRows}
              </p>
              {summary.deletableRows === 0 ? (
                <p className="text-muted-foreground">Sin registros asociados.</p>
              ) : (
                <ul className="list-disc pl-5 text-muted-foreground">
                  {verdict.deletionPlan
                    .filter((entry) => entry.count > 0)
                    .map((entry) => (
                      <li key={entry.table}>
                        {entry.count} {entry.label.toLowerCase()}
                      </li>
                    ))}
                </ul>
              )}

              {totalOfPlan(verdict.unlinkPlan) > 0 && (
                <>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Se conservará sin vínculo · {totalOfPlan(verdict.unlinkPlan)}
                  </p>
                  <ul className="list-disc pl-5 text-muted-foreground">
                    {verdict.unlinkPlan
                      .filter((entry) => entry.count > 0)
                      .map((entry) => (
                        <li key={entry.table}>
                          {entry.count} {entry.label.toLowerCase()}
                        </li>
                      ))}
                  </ul>
                </>
              )}

              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Nunca se toca
              </p>
              <p className="text-muted-foreground">
                {verdict.preserved.map((entry) => entry.label).join(", ")}.
              </p>
            </div>

            <div className="rounded-xl border border-border p-3 text-sm">
              <p className="font-medium">Libro contable</p>
              <p className="text-muted-foreground">{describeLedger(analysis.ledger)}</p>
              {verdict.warnings
                .filter((warning) => warning.code === "ledger_chain_removed")
                .map((warning) => (
                  <p key={warning.code} className="text-muted-foreground mt-1">
                    {warning.message}
                  </p>
                ))}
            </div>

            {verdict.warnings.length > 0 && (
              <div className="rounded-xl border border-border bg-secondary/30 p-3 text-sm">
                <p className="font-medium">A tener en cuenta</p>
                <ul className="mt-1 list-disc pl-5 text-muted-foreground">
                  {verdict.warnings.map((warning) => (
                    <li key={warning.code}>{warning.message}</li>
                  ))}
                </ul>
              </div>
            )}

            <div
              role="alert"
              className="flex gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
            >
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>
                Eliminación IRREVERSIBLE. Se guarda un respaldo verificable (sello SHA-256) y la
                operación queda registrada en la auditoría, pero la campaña y sus datos de prueba no
                se pueden recuperar desde el panel.
              </span>
            </div>

            {(mustMark || canPurge) && (
              <div className="space-y-3 rounded-xl border border-border p-3">
                <p className="text-sm font-medium flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4" />
                  {mustMark ? "Paso 1 · Declarar la campaña como DEMO" : "Confirmación del superadmin"}
                </p>

                <div className="space-y-1.5">
                  <Label htmlFor="demo-purge-reason">Motivo (obligatorio)</Label>
                  <Input
                    id="demo-purge-reason"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder={`Explica por qué son datos de prueba (mínimo ${MIN_DEMO_REASON} caracteres)`}
                    className="rounded-xl"
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="demo-purge-password">Tu contraseña (reautenticación)</Label>
                    <Input
                      id="demo-purge-password"
                      type="password"
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="rounded-xl"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="demo-purge-totp">Código 2FA (si está activo)</Label>
                    <Input
                      id="demo-purge-totp"
                      inputMode="numeric"
                      value={totpCode}
                      onChange={(e) => setTotpCode(e.target.value)}
                      placeholder="123456"
                      className="rounded-xl"
                    />
                  </div>
                </div>

                {!mustMark && (
                  <>
                    <div className="space-y-1.5">
                      <Label htmlFor="demo-purge-identifier">
                        Escribe el identificador de la campaña ({campaignId}) para confirmar
                      </Label>
                      <Input
                        id="demo-purge-identifier"
                        value={identifier}
                        onChange={(e) => setIdentifier(e.target.value)}
                        placeholder={String(campaignId ?? "")}
                        className="rounded-xl"
                      />
                    </div>

                    <div className="flex items-start gap-2">
                      <Checkbox
                        id="demo-purge-ack"
                        checked={acknowledged}
                        onCheckedChange={(value) => setAcknowledged(value === true)}
                      />
                      <Label htmlFor="demo-purge-ack" className="text-sm font-normal leading-snug">
                        Entiendo que la campaña y sus datos de prueba se eliminarán de forma
                        permanente y que la operación es irreversible.
                      </Label>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" className="rounded-xl" onClick={close} disabled={busy}>
            Cancelar
          </Button>

          {analysis && !canPurge && !mustMark && (
            <>
              <Link href="/admin/libro">
                <Button variant="outline" className="rounded-xl">
                  Anular contablemente
                </Button>
              </Link>
              <Button
                variant="outline"
                className="rounded-xl gap-2"
                onClick={handleArchive}
                disabled={busy}
              >
                <Archive className="w-4 h-4" /> Archivar
              </Button>
            </>
          )}

          {mustMark && (
            <Button
              className="rounded-xl gap-2"
              onClick={handleMark}
              disabled={busy || !reasonOk || password.length === 0}
            >
              {mark.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <ShieldCheck className="w-4 h-4" />
              )}
              Marcar como DEMO
            </Button>
          )}

          {canPurge && (
            <Button
              variant="destructive"
              className="rounded-xl gap-2"
              onClick={handlePurge}
              disabled={busy || !reasonOk || !identifierOk || !acknowledged || password.length === 0}
              title={
                !identifierOk
                  ? `Escribe ${campaignId} para confirmar la campaña`
                  : !acknowledged
                    ? "Marca la casilla de irreversibilidad"
                    : undefined
              }
            >
              {purge.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4" />
              )}
              Eliminar campaña DEMO
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SummaryTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-secondary/30 p-2.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-lg font-semibold">{value}</dd>
    </div>
  );
}

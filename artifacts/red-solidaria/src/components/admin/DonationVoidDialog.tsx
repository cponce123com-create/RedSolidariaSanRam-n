import { useEffect, useState } from "react";
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
  useCampaignAnnulmentPreview,
  useDonationAnnulment,
} from "@/hooks/use-donors-admin";
import { errorMessage } from "@/lib/api-error";
import { donationStatusLabel } from "@/lib/donors-admin";
import {
  MIN_ANNUL_REASON,
  annulmentHeadline,
  annulmentSummary,
  campaignIdentifierMatches,
  describeAnnulmentPlan,
  reconciledWarning,
  reversalNotice,
} from "@/lib/donation-annulment";
import { AlertTriangle, Loader2, ShieldCheck, Undo2 } from "lucide-react";

interface DonationVoidDialogProps {
  /** Donación concreta (anulación individual). */
  donation?: {
    id: number;
    title: string;
    amount: number;
    status: string;
    campaignId?: number | null;
  } | null;
  /** Campaña (anulación en bloque de todas sus donaciones confirmadas). */
  campaignId?: number | null;
  campaignTitle?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Anulación contable de donaciones (V7.2.2).
 *
 * Explica SIEMPRE, antes de confirmar, que NO se borra nada: la donación pasa a
 * «Anulada» (sale de todas las cifras) y se añade un ASIENTO COMPENSATORIO al
 * libro append-only, de modo que el saldo sigue cuadrando y la cadena sigue
 * verificando. Exige motivo y reautenticación del superadmin; en modo bloque,
 * además, el identificador de la campaña escrito a mano.
 */
export function DonationVoidDialog({
  donation = null,
  campaignId = null,
  campaignTitle = "",
  open,
  onOpenChange,
}: DonationVoidDialogProps) {
  const isBulk = !donation;
  const { voidOne, voidCampaign } = useDonationAnnulment();
  const { data: preview, isLoading, isError, error } = useCampaignAnnulmentPreview(
    open && isBulk ? campaignId : null,
  );

  const [reason, setReason] = useState("");
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setReason("");
      setPassword("");
      setTotpCode("");
      setIdentifier("");
      setAcknowledged(false);
      setFormError(null);
    }
  }, [open]);

  const plan = preview?.plan;
  const summary = annulmentSummary(plan);
  const busy = voidOne.isPending || voidCampaign.isPending;
  const reasonOk = reason.trim().length >= MIN_ANNUL_REASON;
  const identifierOk =
    !isBulk || (campaignId !== null && campaignIdentifierMatches(identifier, campaignId));
  const canConfirm = isBulk ? Boolean(plan?.allowed) : true;

  const close = () => onOpenChange(false);

  const submit = () => {
    setFormError(null);
    const payload = { reason: reason.trim(), password, totpCode: totpCode || undefined };
    if (isBulk) {
      if (!campaignId) return;
      voidCampaign.mutate(
        { campaignId, ...payload },
        {
          onSuccess: close,
          onError: (err) => setFormError(errorMessage(err)),
        },
      );
      return;
    }
    if (!donation) return;
    voidOne.mutate(
      { id: donation.id, ...payload },
      {
        onSuccess: close,
        onError: (err) => setFormError(errorMessage(err)),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[620px] rounded-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-display flex items-center gap-2">
            <Undo2 className="w-5 h-5 text-destructive" />
            {isBulk ? annulmentHeadline(plan) : "Anular contablemente la donación"}
          </DialogTitle>
          <DialogDescription>
            {isBulk
              ? `«${preview?.campaign.title ?? campaignTitle}» · identificador ${campaignId ?? "—"}`
              : `${donation?.title ?? ""} · donación #${donation?.id ?? "—"}`}
          </DialogDescription>
        </DialogHeader>

        {isBulk && isLoading && (
          <div className="flex items-center gap-2 py-6 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Analizando las donaciones de la campaña…
          </div>
        )}

        {isBulk && isError && (
          <div
            role="alert"
            className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
          >
            {errorMessage(error, "No se pudieron analizar las donaciones.")}
          </div>
        )}

        <div className="space-y-4">
          {!isBulk && donation && (
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-xl border border-border bg-secondary/30 p-2.5">
                <dt className="text-xs text-muted-foreground">Importe</dt>
                <dd className="text-lg font-semibold">S/ {donation.amount.toFixed(2)}</dd>
              </div>
              <div className="rounded-xl border border-border bg-secondary/30 p-2.5">
                <dt className="text-xs text-muted-foreground">Estado actual</dt>
                <dd className="text-lg font-semibold">{donationStatusLabel(donation.status)}</dd>
              </div>
            </dl>
          )}

          {isBulk && plan && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{describeAnnulmentPlan(plan)}</Badge>
                {summary.reconciled > 0 && (
                  <Badge variant="outline" className="border-amber-300 text-amber-800">
                    {summary.reconciled} conciliada(s)
                  </Badge>
                )}
                {summary.blocked > 0 && (
                  <Badge variant="outline" className="border-border text-muted-foreground">
                    {summary.blocked} sin tocar
                  </Badge>
                )}
              </div>

              {plan.annullable.length > 0 && (
                <ul className="list-disc pl-5 text-sm text-muted-foreground">
                  {plan.annullable.map((item) => (
                    <li key={item.donationId}>
                      Donación #{item.donationId} · S/ {item.amount.toFixed(2)}
                      {item.reconciled ? " · conciliada" : ""}
                    </li>
                  ))}
                </ul>
              )}

              {plan.blocked.length > 0 && (
                <div className="rounded-xl border border-border bg-secondary/30 p-3 text-sm">
                  <p className="font-medium">No se tocarán</p>
                  <ul className="mt-1 list-disc pl-5 text-muted-foreground">
                    {plan.blocked.map((item) => (
                      <li key={item.donationId}>
                        Donación #{item.donationId} ({donationStatusLabel(item.status)}):{" "}
                        {item.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          <div className="rounded-xl border border-border p-3 text-sm">
            <p className="font-medium flex items-center gap-2">
              <ShieldCheck className="w-4 h-4" /> Se conserva todo: solo se compensa
            </p>
            <p className="text-muted-foreground mt-1">
              La donación pasa a «Anulada» y deja de contar en las cifras (recaudado, donantes,
              transparencia y dashboard). {isBulk ? reversalNotice(plan) : "Se añadirá un asiento compensatorio al libro append-only: la cadena sigue verificando y el saldo sigue cuadrando. No se borra ningún registro."}
            </p>
          </div>

          {isBulk && reconciledWarning(plan) && (
            <div
              role="alert"
              className="flex gap-2 rounded-xl border border-amber-300/60 bg-amber-50 p-3 text-sm text-amber-900"
            >
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{reconciledWarning(plan)}</span>
            </div>
          )}

          {!canConfirm && (
            <div
              role="alert"
              className="flex gap-2 rounded-xl border border-border bg-secondary/30 p-3 text-sm"
            >
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>
                No hay donaciones confirmadas (aprobadas o conciliadas) que se puedan anular. Las
                pendientes y rechazadas no tienen asiento en el libro: gestiónalas con el rechazo
                normal.
              </span>
            </div>
          )}

          {canConfirm && (
            <div className="space-y-3 rounded-xl border border-border p-3">
              <p className="text-sm font-medium">Confirmación del superadmin</p>

              <div className="space-y-1.5">
                <Label htmlFor="annul-reason">Motivo (obligatorio)</Label>
                <Input
                  id="annul-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder={`Explica por qué se anula (mínimo ${MIN_ANNUL_REASON} caracteres)`}
                  className="rounded-xl"
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="annul-password">Tu contraseña (reautenticación)</Label>
                  <Input
                    id="annul-password"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="rounded-xl"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="annul-totp">Código 2FA (si está activo)</Label>
                  <Input
                    id="annul-totp"
                    inputMode="numeric"
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value)}
                    placeholder="123456"
                    className="rounded-xl"
                  />
                </div>
              </div>

              {isBulk && (
                <div className="space-y-1.5">
                  <Label htmlFor="annul-identifier">
                    Escribe el identificador de la campaña ({campaignId}) para confirmar
                  </Label>
                  <Input
                    id="annul-identifier"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder={String(campaignId ?? "")}
                    className="rounded-xl"
                  />
                </div>
              )}

              <div className="flex items-start gap-2">
                <Checkbox
                  id="annul-ack"
                  checked={acknowledged}
                  onCheckedChange={(value) => setAcknowledged(value === true)}
                />
                <Label htmlFor="annul-ack" className="text-sm font-normal leading-snug">
                  Entiendo que la donación dejará de contar en las cifras y que la corrección queda
                  registrada en el libro y en la auditoría.
                </Label>
              </div>
            </div>
          )}
        </div>

        {formError && (
          <div
            role="alert"
            className="flex gap-2 rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
          >
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{formError}</span>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" className="rounded-xl" onClick={close} disabled={busy}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            className="rounded-xl gap-2"
            onClick={submit}
            disabled={
              busy || !canConfirm || !reasonOk || !identifierOk || !acknowledged || password.length === 0
            }
            title={
              !identifierOk
                ? `Escribe ${campaignId} para confirmar la campaña`
                : !acknowledged
                  ? "Marca la casilla de confirmación"
                  : undefined
            }
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Undo2 className="w-4 h-4" />}
            Anular contablemente
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

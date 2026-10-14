import { useParams, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useDonor, useReconcileDonation } from "@/hooks/use-donors-admin";
import {
  donationStatusBadge,
  donationStatusLabel,
  donorTypeLabel,
  summarizeDonations,
} from "@/lib/donors-admin";
import { formatSafeDate } from "@/lib/i18n/date";
import { ArrowLeft, CheckCircle2, Loader2, Star } from "lucide-react";

/**
 * Ficha de donante (Fase 3): datos de contacto (privados) e historial de
 * donaciones. Desde aquí se CONCILIA una donación aprobada (operación trazable:
 * el backend registra quién y cuándo).
 */
export default function AdminDonorDetail() {
  const params = useParams<{ id?: string }>();
  const id = Number(params.id);
  const { data: donor, isLoading, isError } = useDonor(id);
  const reconcile = useReconcileDonation();

  const totals = summarizeDonations(donor?.donations);

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <Link href="/admin/donantes">
          <Button variant="ghost" size="icon" className="rounded-full shadow-sm bg-card" aria-label="Volver a donantes">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-3xl font-display font-bold text-foreground truncate">
            {donor?.name ?? "Donante"}
          </h1>
          {donor && (
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <Badge variant="outline">{donorTypeLabel(donor.type)}</Badge>
              {donor.isRecurring && (
                <Badge variant="outline" className="border-amber-300 text-amber-700">
                  <Star className="w-3 h-3 mr-1 fill-yellow-400 text-yellow-500" /> Recurrente
                </Badge>
              )}
            </div>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="h-40 flex items-center justify-center text-muted-foreground">Cargando ficha...</div>
      ) : isError || !donor ? (
        <div className="rounded-3xl border border-destructive/30 bg-destructive/5 p-6 text-destructive">
          No se pudo cargar la ficha del donante.
        </div>
      ) : (
        <div className="space-y-6">
          {/* Datos de contacto (privados) */}
          <div className="rounded-3xl border border-border bg-card p-6">
            <h2 className="text-lg font-bold text-foreground mb-4">Datos de contacto (privados)</h2>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground font-semibold mb-1">Correo</div>
                <div className="text-sm font-medium text-foreground break-all">{donor.email || "—"}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground font-semibold mb-1">Teléfono</div>
                <div className="text-sm font-medium text-foreground">{donor.phone || "—"}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground font-semibold mb-1">Alta</div>
                <div className="text-sm font-medium text-foreground">
                  {donor.createdAt ? formatSafeDate(donor.createdAt, "dd/MM/yyyy") : "—"}
                </div>
              </div>
            </div>
            {donor.notes ? (
              <p className="text-sm text-muted-foreground mt-4 whitespace-pre-wrap">{donor.notes}</p>
            ) : null}
          </div>

          {/* Totales verificables */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl bg-secondary/50 p-5 border border-border/50">
              <div className="text-xs uppercase tracking-wide text-muted-foreground font-semibold mb-1">
                Donaciones registradas
              </div>
              <div className="text-2xl font-display font-bold text-foreground">{totals.count}</div>
            </div>
            <div className="rounded-2xl bg-primary/5 p-5 border border-primary/20">
              <div className="text-xs uppercase tracking-wide text-primary font-semibold mb-1">
                Total confirmado (aprobado + conciliado)
              </div>
              <div className="text-2xl font-display font-bold text-primary">
                S/ {totals.confirmedTotal.toLocaleString("es-PE")}
              </div>
            </div>
          </div>

          {/* Historial */}
          <div className="rounded-3xl border border-border bg-card overflow-hidden">
            <div className="px-6 py-4 border-b border-border">
              <h2 className="text-lg font-bold text-foreground">Historial de donaciones</h2>
            </div>
            <Table>
              <TableHeader className="bg-secondary/30">
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                  <TableHead>Método</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead className="text-right">Conciliación</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {donor.donations.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                      Este donante aún no tiene donaciones asociadas.
                    </TableCell>
                  </TableRow>
                ) : (
                  donor.donations.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell className="text-sm text-muted-foreground">#{d.id}</TableCell>
                      <TableCell className="text-right font-bold">
                        S/ {d.amount.toLocaleString("es-PE")}
                      </TableCell>
                      <TableCell className="text-sm">{d.paymentMethod}</TableCell>
                      <TableCell>
                        <Badge className={`${donationStatusBadge(d.status)} border-0 shadow-sm`}>
                          {donationStatusLabel(d.status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {d.createdAt ? formatSafeDate(d.createdAt, "dd/MM/yy HH:mm") : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        {d.status === "approved" ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 rounded-lg text-xs font-medium"
                            disabled={reconcile.isPending}
                            onClick={() => reconcile.mutate(d.id)}
                          >
                            {reconcile.isPending ? (
                              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                            ) : (
                              <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                            )}
                            Conciliar
                          </Button>
                        ) : d.status === "reconciled" ? (
                          <span className="text-xs text-muted-foreground">
                            {d.reconciledBy ? `por ${d.reconciledBy}` : "conciliada"}
                            {d.reconciledAt
                              ? ` · ${formatSafeDate(d.reconciledAt, "dd/MM/yy")}`
                              : ""}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <p className="text-xs text-muted-foreground">
            Solo se pueden conciliar donaciones <strong>aprobadas</strong>. La conciliación queda
            registrada con el usuario y la fecha: ninguna corrección es silenciosa.
          </p>
        </div>
      )}
    </div>
  );
}

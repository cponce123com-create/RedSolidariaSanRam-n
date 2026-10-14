import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Wand2,
} from "lucide-react";
import { formatSafeDate } from "@/lib/i18n/date";
import { useGetAdminMe } from "@workspace/api-client-react";

/**
 * Informe de integridad del libro contable (Fases 1.4 y 2 del Prompt Maestro V7).
 *
 * El informe es de SOLO LECTURA: la cadena de hashes puede verificar y el libro
 * seguir incompleto (donaciones confirmadas sin asiento). Señala los hallazgos y
 * NUNCA corrige por sí solo: la corrección es un asiento compensatorio APILADO
 * (el libro es append-only) que exige autorización reforzada (superadmin),
 * motivo y evidencia documental, y queda auditado.
 *
 * El contrato se declara aquí (endpoint administrativo fuera del cliente
 * generado, mismo patrón que `use-phase3.ts`).
 */

interface DonationWithoutMovement {
  id: number;
  campaignId: number | null;
  amount: number;
}

interface MovementWithoutSource {
  id: number;
  sourceType: string;
  sourceId: number;
}

interface AmountMismatch {
  movementId: number;
  sourceType: string;
  sourceId: number;
  movementAmount: number;
  sourceAmount: number;
}

interface CampaignMismatch {
  movementId: number;
  sourceType: string;
  sourceId: number;
  movementCampaignId: number;
  sourceCampaignId: number | null;
}

interface DuplicateMovementGroup {
  sourceType: string;
  sourceId: number;
  movementIds: number[];
  count: number;
}

interface CampaignTotals {
  campaignId: number;
  ledgerNet: number;
  sourceNet: number;
  balanced: boolean;
}

interface LedgerAuditReport {
  chain: {
    verified: boolean;
    brokenAt: number | null;
    rootHash: string | null;
    count: number;
  };
  movementCount: number;
  donationsWithoutMovement: DonationWithoutMovement[];
  movementsWithoutSource: MovementWithoutSource[];
  amountMismatches: AmountMismatch[];
  campaignMismatches: CampaignMismatch[];
  duplicateMovements: DuplicateMovementGroup[];
  totals: CampaignTotals[];
  unbalancedCampaigns: number[];
  healthy: boolean;
  generatedAt: string;
  audited: {
    movements: number;
    confirmedDonations: number;
    expenses: number;
    confirmedStatuses: string[];
  };
}

interface RegularizationEntry {
  kind: "ingreso";
  campaignId: number;
  amount: number;
  description: string;
  sourceType: "donation";
  sourceId: number;
}

interface RegularizationPreview {
  plan: {
    entries: RegularizationEntry[];
    skipped: { id: number; amount: number; reason: string }[];
    total: number;
    amount: number;
  };
  healthy: boolean;
  generatedAt: string;
}

async function fetchLedgerAudit(): Promise<LedgerAuditReport> {
  const res = await fetch("/api/admin/ledger/audit", { credentials: "include" });
  if (!res.ok) throw new Error("No se pudo cargar el informe de integridad");
  return res.json();
}

async function fetchRegularizationPreview(): Promise<RegularizationPreview> {
  const res = await fetch("/api/admin/ledger/regularize/preview", {
    credentials: "include",
  });
  if (!res.ok) throw new Error("No se pudo preparar la regularización");
  return res.json();
}

interface RegularizeResult {
  applied: { donationId: number; campaignId: number; amount: number }[];
  alreadyPosted: number[];
  skipped: { id: number; amount: number; reason: string }[];
  total: number;
}

async function postRegularize(body: {
  donationIds: number[];
  reason: string;
  evidenceRef: string;
}): Promise<RegularizeResult> {
  const res = await fetch("/api/admin/ledger/regularize", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, confirm: true }),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(payload?.message ?? "No se pudo regularizar el libro contable");
  }
  return payload;
}

const currency = (value: number) =>
  `S/ ${value.toLocaleString("es-PE", { minimumFractionDigits: 2 })}`;

const sourceLabel = (sourceType: string) =>
  sourceType === "donation" ? "donación" : sourceType === "expense" ? "gasto" : sourceType;

export default function AdminLedgerAudit() {
  const queryClient = useQueryClient();
  const { data: adminUser } = useGetAdminMe({
    query: { queryKey: ["/api/admin/me"], retry: false },
  });
  const isSuperAdmin = adminUser?.role === "superadmin" || adminUser?.id === 0;

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["admin-ledger-audit"],
    queryFn: fetchLedgerAudit,
  });

  const findings = data
    ? data.donationsWithoutMovement.length +
      data.movementsWithoutSource.length +
      data.amountMismatches.length +
      data.campaignMismatches.length +
      data.duplicateMovements.length +
      data.unbalancedCampaigns.length
    : 0;

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex flex-wrap justify-between items-center gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold font-display">Libro contable</h1>
          <p className="text-muted-foreground mt-1">
            Informe de integridad de la cadena de hashes y de su conciliación con donaciones y gastos.
            Solo lectura: no modifica ningún registro.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            className="gap-2 rounded-xl h-11"
            asChild
            data-testid="ledger-audit-download"
          >
            <a href="/api/admin/ledger/discrepancies.csv" download>
              <Download className="w-4 h-4" />
              Descargar discrepancias
            </a>
          </Button>
          <Button
            variant="outline"
            className="gap-2 rounded-xl h-11"
            onClick={() => refetch()}
            disabled={isFetching}
            data-testid="ledger-audit-refresh"
          >
            {isFetching ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Actualizar
          </Button>
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      )}

      {isError && (
        <Card className="border-destructive/40">
          <CardContent className="p-6 flex items-center gap-3 text-destructive">
            <AlertTriangle className="w-5 h-5" />
            <p className="font-medium">No se pudo cargar el informe de integridad del libro.</p>
          </CardContent>
        </Card>
      )}

      {data && (
        <>
          <Card
            className={data.healthy ? "border-emerald-300 bg-emerald-50/40" : "border-destructive/40 bg-destructive/5"}
            data-testid="ledger-audit-status"
          >
            <CardContent className="p-6 flex flex-wrap items-center gap-4">
              {data.healthy ? (
                <CheckCircle2 className="w-8 h-8 text-emerald-600" />
              ) : (
                <AlertTriangle className="w-8 h-8 text-destructive" />
              )}
              <div>
                <p className="font-bold text-lg">
                  {data.healthy
                    ? "Libro cuadrado y cadena íntegra"
                    : `Se encontraron ${findings} hallazgo(s) que requieren revisión`}
                </p>
                <p className="text-sm text-muted-foreground">
                  {data.audited.movements} asiento(s), {data.audited.confirmedDonations} donación(es) confirmada(s) y{" "}
                  {data.audited.expenses} gasto(s) auditados ·{" "}
                  {formatSafeDate(data.generatedAt, "dd/MM/yyyy HH:mm")}
                </p>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground font-medium">Cadena de hashes</CardTitle>
              </CardHeader>
              <CardContent>
                <Badge className={data.chain.verified ? "bg-emerald-600 hover:bg-emerald-600" : "bg-destructive hover:bg-destructive"}>
                  <ShieldCheck className="w-3.5 h-3.5 mr-1" />
                  {data.chain.verified ? "Verificada" : `Rota en el asiento ${data.chain.brokenAt ?? "?"}`}
                </Badge>
                <p className="text-xs text-muted-foreground mt-3 font-mono break-all">
                  raíz: {data.chain.rootHash ?? "sin raíz (cadena rota o vacía)"}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground font-medium">Asientos en el libro</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-display font-bold">{data.movementCount}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Estados considerados confirmados: {data.audited.confirmedStatuses.join(", ")}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground font-medium">Hallazgos</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-display font-bold">{findings}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Donaciones sin asiento, asientos sin origen, importes, campañas, duplicados y saldos descuadrados.
                </p>
              </CardContent>
            </Card>
          </div>

          <FindingTable
            title="Donaciones confirmadas sin asiento"
            hint="Ingresos confirmados que no están en el libro: la cadena puede verificar y el libro seguir incompleto."
            empty="Todas las donaciones confirmadas tienen su asiento."
            rows={data.donationsWithoutMovement}
            columns={["Donación", "Campaña", "Importe"]}
            render={(row) => (
              <>
                <TableCell className="font-medium">#{row.id}</TableCell>
                <TableCell>{row.campaignId ?? "fondo general"}</TableCell>
                <TableCell className="text-right font-semibold">{currency(row.amount)}</TableCell>
              </>
            )}
          />

          <FindingTable
            title="Asientos sin origen"
            hint="Asientos cuyo origen (donación o gasto) ya no existe o es de un tipo desconocido."
            empty="Todos los asientos apuntan a un origen existente."
            rows={data.movementsWithoutSource}
            columns={["Asiento", "Origen", "Id origen"]}
            render={(row) => (
              <>
                <TableCell className="font-medium">#{row.id}</TableCell>
                <TableCell>{sourceLabel(row.sourceType)}</TableCell>
                <TableCell>#{row.sourceId}</TableCell>
              </>
            )}
          />

          <FindingTable
            title="Importes descuadrados"
            hint="El asiento registra un importe distinto al de su origen."
            empty="Los importes del libro coinciden con sus orígenes."
            rows={data.amountMismatches}
            columns={["Asiento", "Origen", "Libro", "Origen (registro)"]}
            render={(row) => (
              <>
                <TableCell className="font-medium">#{row.movementId}</TableCell>
                <TableCell>
                  {sourceLabel(row.sourceType)} #{row.sourceId}
                </TableCell>
                <TableCell className="text-right">{currency(row.movementAmount)}</TableCell>
                <TableCell className="text-right font-semibold">{currency(row.sourceAmount)}</TableCell>
              </>
            )}
          />

          <FindingTable
            title="Asientos en otra campaña"
            hint="El asiento apunta a una campaña distinta de la de su origen."
            empty="Todos los asientos apuntan a la campaña de su origen."
            rows={data.campaignMismatches}
            columns={["Asiento", "Origen", "Campaña del libro", "Campaña del origen"]}
            render={(row) => (
              <>
                <TableCell className="font-medium">#{row.movementId}</TableCell>
                <TableCell>
                  {sourceLabel(row.sourceType)} #{row.sourceId}
                </TableCell>
                <TableCell>{row.movementCampaignId}</TableCell>
                <TableCell className="font-semibold">{row.sourceCampaignId ?? "fondo general"}</TableCell>
              </>
            )}
          />

          <FindingTable
            title="Asientos duplicados"
            hint="Un mismo origen generó más de un asiento: la base lo impide, pero el informe lo señala si ocurriera."
            empty="Cada origen tiene exactamente un asiento."
            rows={data.duplicateMovements}
            columns={["Origen", "Id origen", "Asientos", "Nº"]}
            render={(row) => (
              <>
                <TableCell className="font-medium">{sourceLabel(row.sourceType)}</TableCell>
                <TableCell>#{row.sourceId}</TableCell>
                <TableCell className="font-mono text-xs">{row.movementIds.join(", ")}</TableCell>
                <TableCell className="text-right font-semibold">{row.count}</TableCell>
              </>
            )}
          />

          <FindingTable
            title="Saldos descuadrados por campaña"
            hint="El saldo neto del libro no cuadra con la suma de sus orígenes."
            empty="El saldo del libro cuadra con sus orígenes en todas las campañas."
            rows={data.totals.filter((t) => !t.balanced)}
            columns={["Campaña", "Saldo del libro", "Saldo de los orígenes"]}
            render={(row) => (
              <>
                <TableCell className="font-medium">#{row.campaignId}</TableCell>
                <TableCell className="text-right">{currency(row.ledgerNet)}</TableCell>
                <TableCell className="text-right font-semibold">{currency(row.sourceNet)}</TableCell>
              </>
            )}
          />

          <p className="text-xs text-muted-foreground mt-6">
            Este informe no corrige nada por sí solo: el libro es append-only y cualquier corrección debe
            registrarse como un asiento compensatorio autorizado y trazable, conservando la evidencia original.
          </p>

          {isSuperAdmin && (
            <RegularizationPanel
              onDone={() => {
                queryClient.invalidateQueries({ queryKey: ["admin-ledger-audit"] });
              }}
            />
          )}
        </>
      )}
    </div>
  );
}

/**
 * Panel de regularización (Fase 2). Solo para superadmin: muestra el plan de
 * asientos compensatorios y exige motivo + evidencia documental antes de apilar
 * nada. No edita ni borra historial.
 */
function RegularizationPanel({ onDone }: { onDone: () => void }) {
  const [reason, setReason] = useState("");
  const [evidenceRef, setEvidenceRef] = useState("");
  const [selected, setSelected] = useState<number[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  const preview = useQuery({
    queryKey: ["admin-ledger-regularize-preview"],
    queryFn: fetchRegularizationPreview,
  });

  const mutation = useMutation({
    mutationFn: postRegularize,
    onSuccess: (result) => {
      setMessage(
        result.applied.length > 0
          ? `Se apilaron ${result.applied.length} asiento(s) compensatorio(s) por ${currency(result.total)}.`
          : "No había asientos pendientes de regularizar.",
      );
      setSelected([]);
      setReason("");
      setEvidenceRef("");
      preview.refetch();
      onDone();
    },
    onError: (error: unknown) => {
      setMessage(error instanceof Error ? error.message : "No se pudo regularizar.");
    },
  });

  const entries = preview.data?.plan.entries ?? [];
  const skipped = preview.data?.plan.skipped ?? [];
  const selectedTotal = entries
    .filter((entry) => selected.includes(entry.sourceId))
    .reduce((sum, entry) => sum + entry.amount, 0);

  const toggle = (id: number) =>
    setSelected((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );

  return (
    <Card className="mt-6 border-primary/30" data-testid="ledger-regularize-panel">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Wand2 className="w-4 h-4 text-primary" />
          Regularización (solo superadmin)
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Apila asientos compensatorios para las donaciones confirmadas sin asiento. No edita ni borra
          historial: cada corrección es una entrada nueva encadenada, con motivo y evidencia auditados.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {preview.isLoading && (
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Analizando pendientes…
          </p>
        )}

        {preview.isError && (
          <p className="text-sm text-destructive">No se pudo preparar la regularización.</p>
        )}

        {preview.data && entries.length === 0 && skipped.length === 0 && (
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" /> No hay donaciones confirmadas pendientes de asiento.
          </p>
        )}

        {entries.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">
                {entries.length} asiento(s) propuesto(s) · {currency(preview.data?.plan.amount ?? 0)}
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelected(entries.map((entry) => entry.sourceId))}
                >
                  Seleccionar todo
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setSelected([])}>
                  Limpiar
                </Button>
              </div>
            </div>
            <div className="rounded-lg border divide-y">
              {entries.map((entry) => (
                <label
                  key={entry.sourceId}
                  className="flex items-center gap-3 p-3 text-sm cursor-pointer hover:bg-muted/40"
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={selected.includes(entry.sourceId)}
                    onChange={() => toggle(entry.sourceId)}
                  />
                  <span className="flex-1">{entry.description}</span>
                  <span className="text-muted-foreground">Campaña #{entry.campaignId}</span>
                  <span className="font-semibold">{currency(entry.amount)}</span>
                </label>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Seleccionados: {selected.length} · Total a regularizar: {currency(selectedTotal)}
            </p>
          </div>
        )}

        {skipped.length > 0 && (
          <div className="rounded-lg border border-amber-300 bg-amber-50/50 p-3 text-xs text-amber-900 space-y-1">
            <p className="font-medium">No regularizables:</p>
            {skipped.map((item) => (
              <p key={item.id}>
                Donación #{item.id}: {item.reason}
              </p>
            ))}
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="regularize-reason">Motivo (queda auditado)</Label>
            <Textarea
              id="regularize-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Ej.: asiento faltante detectado en la conciliación de octubre"
              rows={2}
              data-testid="regularize-reason"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="regularize-evidence">Evidencia documental</Label>
            <Input
              id="regularize-evidence"
              value={evidenceRef}
              onChange={(event) => setEvidenceRef(event.target.value)}
              placeholder="Nº de comprobante, voucher o informe"
              data-testid="regularize-evidence"
            />
          </div>
        </div>

        {message && (
          <p className="text-sm text-muted-foreground" data-testid="regularize-message">
            {message}
          </p>
        )}

        <Button
          className="gap-2 rounded-xl"
          disabled={
            selected.length === 0 ||
            reason.trim().length < 10 ||
            evidenceRef.trim().length === 0 ||
            mutation.isPending
          }
          onClick={() =>
            mutation.mutate({ donationIds: selected, reason: reason.trim(), evidenceRef: evidenceRef.trim() })
          }
          data-testid="regularize-submit"
        >
          {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
          Regularizar {selected.length > 0 ? `(${selected.length})` : ""}
        </Button>
      </CardContent>
    </Card>
  );
}

interface FindingTableProps<T> {
  title: string;
  hint: string;
  empty: string;
  rows: T[];
  columns: string[];
  render: (row: T) => React.ReactNode;
}

function rowKey(row: unknown, index: number): React.Key {
  const record = (row ?? {}) as Record<string, unknown>;
  const candidate = record.id ?? record.movementId ?? record.campaignId ?? index;
  return typeof candidate === "number" || typeof candidate === "string" ? candidate : index;
}

function FindingTable<T>({
  title,
  hint,
  empty,
  rows,
  columns,
  render,
}: FindingTableProps<T>) {
  return (
    <Card className="mt-6">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          {title}
          <Badge variant={rows.length > 0 ? "destructive" : "secondary"}>{rows.length}</Badge>
        </CardTitle>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" /> {empty}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {columns.map((column) => (
                    <TableHead key={column}>{column}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, index) => (
                  <TableRow key={rowKey(row, index)}>{render(row)}</TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

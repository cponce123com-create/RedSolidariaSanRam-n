import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  Loader2,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { formatSafeDate } from "@/lib/i18n/date";

/**
 * Informe de integridad del libro contable (Fase 1.4 del Prompt Maestro V7).
 *
 * Solo lectura: la cadena de hashes puede verificar y el libro seguir
 * incompleto (donaciones confirmadas sin asiento). El informe señala los
 * hallazgos y NUNCA corrige: cualquier corrección es un asiento compensatorio
 * autorizado y trazable, porque el libro es append-only.
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
  healthy: boolean;
  generatedAt: string;
  audited: {
    movements: number;
    confirmedDonations: number;
    expenses: number;
    confirmedStatuses: string[];
  };
}

async function fetchLedgerAudit(): Promise<LedgerAuditReport> {
  const res = await fetch("/api/admin/ledger/audit", { credentials: "include" });
  if (!res.ok) throw new Error("No se pudo cargar el informe de integridad");
  return res.json();
}

const currency = (value: number) =>
  `S/ ${value.toLocaleString("es-PE", { minimumFractionDigits: 2 })}`;

const sourceLabel = (sourceType: string) =>
  sourceType === "donation" ? "donación" : sourceType === "expense" ? "gasto" : sourceType;

export default function AdminLedgerAudit() {
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["admin-ledger-audit"],
    queryFn: fetchLedgerAudit,
  });

  const findings = data
    ? data.donationsWithoutMovement.length +
      data.movementsWithoutSource.length +
      data.amountMismatches.length +
      data.campaignMismatches.length
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
                  Donaciones sin asiento, asientos sin origen, importes y campañas descuadradas.
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

          <p className="text-xs text-muted-foreground mt-6">
            Este informe no corrige nada por sí solo: el libro es append-only y cualquier corrección debe
            registrarse como un asiento compensatorio autorizado y trazable, conservando la evidencia original.
          </p>
        </>
      )}
    </div>
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

function FindingTable<T extends { id?: number; movementId?: number }>({
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
                  <TableRow key={row.id ?? row.movementId ?? index}>{render(row)}</TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

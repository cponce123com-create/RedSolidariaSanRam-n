import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Eraser, RefreshCw, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Mantenimiento → Gastos DEMO (V10.1).
 *
 * La herramienta que faltaba: VER los gastos que siguen en la base, consultar sus
 * dependencias, SELECCIONAR los ficticios y ELIMINARLOS de verdad (con respaldo,
 * auditoría y comprobación de cifras antes/después). No oculta nada: si un gasto no
 * se puede borrar, dice por qué y qué hacer.
 */

interface LedgerRef {
  id: number;
  kind: string;
  amount: number;
  isTail: boolean;
}

interface ExpenseDiagnosis {
  id: number;
  campaignId: number;
  campaignTitle: string;
  campaignExists: boolean;
  isOrphan: boolean;
  description: string;
  amount: number;
  date: string;
  category: string;
  receiptUrl: string | null;
  classification: string;
  classificationLabel: string;
  isDemoCampaign: boolean;
  protectedCampaign: boolean;
  ledgerMovements: LedgerRef[];
  hasLedgerEntry: boolean;
  conservationObligation: boolean;
  action: string;
  actionLabel: string;
  deletable: boolean;
  blockers: string[];
  reasons: string[];
}

interface ExpensesResponse {
  expenses: ExpenseDiagnosis[];
  summary: {
    total: number;
    totalAmount: number;
    deletableCount: number;
    deletableAmount: number;
    orphans: number;
    withLedger: number;
    byAction: Record<string, { count: number; amount: number }>;
    byClassification: Record<string, { count: number; amount: number }>;
  };
}

interface FinancialSnapshot {
  expensesCount: number;
  expensesTotal: number;
  donationsCount: number;
  donationsTotal: number;
  balance: number;
  movementsCount: number;
  discrepancies: number;
  chainsVerified: boolean;
  brokenChains: number[];
}

interface PurgeResponse {
  ok: boolean;
  deleted: { deletedExpenses: number; deletedMovements: number };
  comparison: {
    before: FinancialSnapshot;
    after: FinancialSnapshot;
    delta: { expensesCount: number; expensesTotal: number; balance: number; movementsCount: number };
    matchesPurged: boolean;
  };
}

const money = (value: number): string =>
  new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(value);

const ACTION_TONE: Record<string, string> = {
  delete: "bg-red-50 text-red-800 border-red-200",
  purge_with_ledger: "bg-amber-50 text-amber-900 border-amber-200",
  annul: "bg-blue-50 text-blue-900 border-blue-200",
  regularize: "bg-indigo-50 text-indigo-900 border-indigo-200",
  review: "bg-gray-100 text-gray-800 border-gray-200",
};

export default function AdminMaintenanceExpenses() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState<string>("");
  const [campaignFilter, setCampaignFilter] = useState<string>("");
  const [selected, setSelected] = useState<number[]>([]);
  const [detail, setDetail] = useState<ExpenseDiagnosis | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PurgeResponse | null>(null);

  const expensesQuery = useQuery({
    queryKey: ["maintenance-expenses"],
    queryFn: async () => {
      const res = await fetch("/api/admin/maintenance/expenses", { credentials: "include" });
      if (!res.ok) throw new Error("No se pudieron leer los gastos");
      return (await res.json()) as ExpensesResponse;
    },
  });

  const rows = expensesQuery.data?.expenses ?? [];
  const summary = expensesQuery.data?.summary;

  const campaigns = useMemo(() => {
    const map = new Map<number, string>();
    for (const row of rows) map.set(row.campaignId, row.campaignTitle);
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [rows]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (actionFilter && row.action !== actionFilter) return false;
      if (campaignFilter && String(row.campaignId) !== campaignFilter) return false;
      if (!needle) return true;
      return (
        row.description.toLowerCase().includes(needle) ||
        String(row.id) === needle ||
        row.campaignTitle.toLowerCase().includes(needle) ||
        row.category.toLowerCase().includes(needle)
      );
    });
  }, [rows, search, actionFilter, campaignFilter]);

  const selectedRows = useMemo(
    () => rows.filter((row) => selected.includes(row.id)),
    [rows, selected],
  );
  const selectedAmount = selectedRows.reduce((sum, row) => sum + row.amount, 0);
  const selectedBlocked = selectedRows.filter((row) => !row.deletable);

  const previewMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      const res = await fetch("/api/admin/maintenance/expenses/purge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ids, preview: true }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.message ?? "No se pudo preparar la vista previa");
      return data;
    },
  });

  const purgeMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/maintenance/expenses/purge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          ids: selected,
          confirm: true,
          reason,
          password,
          totpCode: totpCode || undefined,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          Array.isArray(data?.blocked) && data.blocked.length > 0
            ? `${data.message} ${data.blocked
                .map((b: { id: number; actionLabel: string }) => `#${b.id}: ${b.actionLabel}`)
                .join(" · ")}`
            : (data?.message ?? "No se pudieron eliminar los gastos"),
        );
      }
      return data as PurgeResponse;
    },
    onSuccess: async (data) => {
      setResult(data);
      setSelected([]);
      setPassword("");
      setTotpCode("");
      setReason("");
      setDialogOpen(false);
      // Fase 6: las cifras del panel deben reflejar el borrado de inmediato.
      await queryClient.invalidateQueries();
    },
  });

  const toggle = (id: number) =>
    setSelected((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Eraser className="w-6 h-6 text-primary" /> Gastos DEMO
        </h1>
        <p className="text-sm text-muted-foreground">
          Gastos que siguen en la base de datos. Selecciona los ficticios y elimínalos de verdad:
          la operación queda respaldada, auditada y con las cifras comprobadas antes y después.
        </p>
      </header>

      {summary && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryCard label="Gastos en la base" value={String(summary.total)} hint={money(summary.totalAmount)} />
          <SummaryCard
            label="Eliminables ahora"
            value={String(summary.deletableCount)}
            hint={money(summary.deletableAmount)}
            tone="text-red-700"
          />
          <SummaryCard label="Con asiento en el libro" value={String(summary.withLedger)} hint="requieren purga controlada" />
          <SummaryCard label="Huérfanos" value={String(summary.orphans)} hint="campaña inexistente" />
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-gray-100 bg-card p-4">
        <div className="min-w-[220px] flex-1">
          <Label htmlFor="expense-search">Buscar</Label>
          <Input
            id="expense-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Descripción, id, campaña o categoría"
          />
        </div>
        <div>
          <Label htmlFor="expense-action">Acción permitida</Label>
          <select
            id="expense-action"
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            value={actionFilter}
            onChange={(event) => setActionFilter(event.target.value)}
          >
            <option value="">Todas</option>
            <option value="delete">Eliminación definitiva</option>
            <option value="purge_with_ledger">Purga controlada</option>
            <option value="annul">Anulación trazable</option>
            <option value="regularize">Corrección autorizada</option>
            <option value="review">Revisión manual</option>
          </select>
        </div>
        <div>
          <Label htmlFor="expense-campaign">Campaña</Label>
          <select
            id="expense-campaign"
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            value={campaignFilter}
            onChange={(event) => setCampaignFilter(event.target.value)}
          >
            <option value="">Todas</option>
            {campaigns.map(([id, title]) => (
              <option key={id} value={String(id)}>
                #{id} · {title}
              </option>
            ))}
          </select>
        </div>
        <Button variant="outline" onClick={() => void expensesQuery.refetch()}>
          <RefreshCw className="w-4 h-4 mr-1" /> Actualizar
        </Button>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-gray-100 bg-card">
        <table className="w-full text-sm">
          <thead className="bg-gray-50/60 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="p-3">
                <input
                  type="checkbox"
                  aria-label="Seleccionar todos los eliminables"
                  checked={filtered.length > 0 && filtered.filter((r) => r.deletable).every((r) => selected.includes(r.id))}
                  onChange={(event) => {
                    const deletable = filtered.filter((row) => row.deletable).map((row) => row.id);
                    setSelected(event.target.checked ? [...new Set([...selected, ...deletable])] : []);
                  }}
                />
              </th>
              <th className="p-3">ID</th>
              <th className="p-3">Campaña</th>
              <th className="p-3">Descripción</th>
              <th className="p-3 text-right">Importe</th>
              <th className="p-3">Fecha</th>
              <th className="p-3">Categoría</th>
              <th className="p-3">Clasificación</th>
              <th className="p-3">Asiento</th>
              <th className="p-3">Evidencia</th>
              <th className="p-3">Acción permitida</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => (
              <tr key={row.id} className="border-t border-gray-50 align-top">
                <td className="p-3">
                  <input
                    type="checkbox"
                    aria-label={`Seleccionar gasto ${row.id}`}
                    checked={selected.includes(row.id)}
                    disabled={!row.deletable}
                    onChange={() => toggle(row.id)}
                  />
                </td>
                <td className="p-3 font-mono">{row.id}</td>
                <td className="p-3">
                  <span className="block">{row.campaignTitle}</span>
                  <span className="text-xs text-muted-foreground">
                    #{row.campaignId}
                    {row.protectedCampaign && " · protegida"}
                    {row.isOrphan && " · huérfano"}
                  </span>
                </td>
                <td className="p-3 max-w-[260px]">{row.description}</td>
                <td className="p-3 text-right font-mono">{money(row.amount)}</td>
                <td className="p-3">{row.date}</td>
                <td className="p-3">{row.category}</td>
                <td className="p-3">
                  <span className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs">
                    {row.classificationLabel}
                  </span>
                </td>
                <td className="p-3">
                  {row.hasLedgerEntry ? (
                    <span className="text-amber-800">#{row.ledgerMovements.map((m) => m.id).join(", ")}</span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="p-3">
                  {row.receiptUrl ? (
                    <a href={row.receiptUrl} target="_blank" rel="noreferrer" className="text-primary underline">
                      ver
                    </a>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="p-3">
                  <button
                    type="button"
                    onClick={() => setDetail(row)}
                    className={`rounded-full border px-2 py-0.5 text-xs font-medium ${ACTION_TONE[row.action] ?? ""}`}
                  >
                    {row.actionLabel}
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={11} className="p-6 text-center text-muted-foreground">
                  No hay gastos que coincidan con el filtro.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {selected.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-4">
          <p className="text-sm">
            <strong>{selected.length}</strong> gasto(s) seleccionado(s) · <strong>{money(selectedAmount)}</strong>
            {selectedBlocked.length > 0 && (
              <span className="ml-2 text-red-700">
                {selectedBlocked.length} no se puede(n) eliminar: quítalos de la selección.
              </span>
            )}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setSelected([])}>
              Limpiar
            </Button>
            <Button
              onClick={() => {
                setError(null);
                setResult(null);
                setDialogOpen(true);
                previewMutation.mutate(selected);
              }}
              disabled={selectedBlocked.length > 0 || previewMutation.isPending}
            >
              Eliminar seleccionados…
            </Button>
          </div>
        </div>
      )}

      {result && (
        <div className="space-y-2 rounded-2xl border border-green-200 bg-green-50 p-4 text-sm">
          <p className="flex items-center gap-2 font-semibold text-green-900">
            <CheckCircle2 className="w-4 h-4" />
            Eliminados {result.deleted.deletedExpenses} gasto(s) y {result.deleted.deletedMovements} asiento(s).
          </p>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-green-900/70">
                <th className="py-1">Cifra</th>
                <th className="py-1 text-right">Antes</th>
                <th className="py-1 text-right">Después</th>
                <th className="py-1 text-right">Diferencia</th>
              </tr>
            </thead>
            <tbody className="font-mono">
              <ComparisonRow label="Gastos" before={result.comparison.before.expensesTotal} after={result.comparison.after.expensesTotal} />
              <ComparisonRow label="Donaciones" before={result.comparison.before.donationsTotal} after={result.comparison.after.donationsTotal} />
              <ComparisonRow label="Saldo" before={result.comparison.before.balance} after={result.comparison.after.balance} />
              <tr>
                <td className="py-1">Asientos</td>
                <td className="py-1 text-right">{result.comparison.before.movementsCount}</td>
                <td className="py-1 text-right">{result.comparison.after.movementsCount}</td>
                <td className="py-1 text-right">{result.comparison.delta.movementsCount}</td>
              </tr>
            </tbody>
          </table>
          <p className={result.comparison.matchesPurged ? "text-green-900" : "font-semibold text-red-800"}>
            {result.comparison.matchesPurged
              ? "La diferencia coincide exactamente con lo eliminado."
              : "AVISO: la diferencia NO coincide con lo eliminado. Revísalo antes de seguir."}
            {" "}
            Cadenas verificadas: {result.comparison.after.chainsVerified ? "sí" : `no (${result.comparison.after.brokenChains.join(", ")})`}.
          </p>
        </div>
      )}

      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
          <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-card p-6 shadow-xl">
            <h2 className="text-lg font-semibold">
              Gasto #{detail.id} · {money(detail.amount)}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">{detail.description}</p>
            <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
              <Detail label="Campaña" value={`${detail.campaignTitle} (#${detail.campaignId})`} />
              <Detail label="Fecha" value={detail.date} />
              <Detail label="Categoría" value={detail.category} />
              <Detail label="Clasificación" value={detail.classificationLabel} />
              <Detail label="¿Huérfano?" value={detail.isOrphan ? "Sí" : "No"} />
              <Detail label="¿Campaña DEMO?" value={detail.isDemoCampaign ? "Sí" : "No"} />
              <Detail label="¿Protegida (ChocoFest)?" value={detail.protectedCampaign ? "Sí" : "No"} />
              <Detail label="¿Documento propio?" value={detail.conservationObligation ? "Sí (se conserva)" : "No"} />
              <Detail
                label="Asientos del libro"
                value={detail.hasLedgerEntry ? detail.ledgerMovements.map((m) => `#${m.id} (${m.kind})`).join(", ") : "ninguno"}
              />
              <Detail label="Acción permitida" value={detail.actionLabel} />
            </dl>
            <div className="mt-4 space-y-1 text-sm">
              {detail.reasons.map((reason) => (
                <p key={reason} className="text-muted-foreground">
                  · {reason}
                </p>
              ))}
            </div>
            <div className="mt-4 flex justify-end">
              <Button variant="outline" onClick={() => setDetail(null)}>
                Cerrar
              </Button>
            </div>
          </div>
        </div>
      )}

      {dialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-lg space-y-4 rounded-2xl bg-card p-6 shadow-xl">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-red-600" /> Eliminar {selected.length} gasto(s)
            </h2>
            <p className="text-sm text-muted-foreground">
              Se borrarán de PostgreSQL, con respaldo verificable y registro de auditoría. Esta acción
              no se puede deshacer desde el panel.
            </p>

            {previewMutation.data?.plan?.totals && (
              <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-3 text-sm">
                <p>
                  Importe total: <strong>{money(previewMutation.data.plan.totals.amount)}</strong> · asientos:{" "}
                  <strong>{previewMutation.data.plan.totals.movements}</strong>
                </p>
                <ul className="mt-1 text-xs text-muted-foreground">
                  {previewMutation.data.plan.totals.byCampaign.map(
                    (group: { campaignId: number; campaignTitle: string; count: number; amount: number }) => (
                      <li key={group.campaignId}>
                        #{group.campaignId} {group.campaignTitle}: {group.count} gasto(s), {money(group.amount)}
                      </li>
                    ),
                  )}
                </ul>
              </div>
            )}

            {previewMutation.isError && (
              <p className="text-sm text-red-700">{(previewMutation.error as Error).message}</p>
            )}
            {error && <p className="text-sm text-red-700">{error}</p>}

            <div className="space-y-3">
              <div>
                <Label htmlFor="purge-reason">Motivo (obligatorio, queda auditado)</Label>
                <Input
                  id="purge-reason"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="Ej.: gastos de prueba de la campaña DEMO Escolar 2025"
                />
              </div>
              <div>
                <Label htmlFor="purge-password">Tu contraseña (reautenticación)</Label>
                <Input
                  id="purge-password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="purge-totp">Código 2FA (si lo tienes activo)</Label>
                <Input
                  id="purge-totp"
                  value={totpCode}
                  onChange={(event) => setTotpCode(event.target.value)}
                  inputMode="numeric"
                  placeholder="123456"
                />
              </div>
            </div>

            {purgeMutation.isError && (
              <p className="flex items-start gap-2 text-sm text-red-700">
                <AlertTriangle className="w-4 h-4 mt-0.5" />
                {(purgeMutation.error as Error).message}
              </p>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button
                variant="destructive"
                onClick={() => purgeMutation.mutate()}
                disabled={reason.trim().length < 10 || password.length === 0 || purgeMutation.isPending}
              >
                {purgeMutation.isPending ? "Eliminando…" : "Eliminar definitivamente"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: string }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-card p-4">
      <p className="text-xs uppercase text-muted-foreground">{label}</p>
      <p className={`text-2xl font-bold ${tone ?? "text-gray-900"}`}>{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase text-muted-foreground">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function ComparisonRow({ label, before, after }: { label: string; before: number; after: number }) {
  return (
    <tr>
      <td className="py-1">{label}</td>
      <td className="py-1 text-right">{money(before)}</td>
      <td className="py-1 text-right">{money(after)}</td>
      <td className="py-1 text-right">{money(after - before)}</td>
    </tr>
  );
}

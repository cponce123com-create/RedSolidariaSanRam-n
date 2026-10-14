import { useEffect, useState } from "react";
import { useParams, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { formatSafeDate } from "@/lib/i18n/date";
import { ArrowLeft, Loader2, Printer } from "lucide-react";

interface TransparencyMovement {
  type: string;
  description: string;
  amount: number;
  date: string | null;
}

/**
 * Subconjunto del endpoint público de transparencia que usa el informe.
 * (El endpoint devuelve más campos; aquí solo se declaran los que se imprimen.)
 */
interface CampaignReport {
  campaignId: number;
  title: string;
  goal: number;
  totalRaised: number;
  totalSpent: number;
  publicSpent: number;
  balance: number;
  donorCount: number;
  executionPercent: number;
  raisedPercent: number;
  expenseCount: number;
  publicExpenseCount: number;
  evidenceCount: number;
  publicEvidenceCount: number;
  leftoverCount: number;
  publicLeftoverCount: number;
  recentMovements: TransparencyMovement[];
}

function money(value: number): string {
  return `S/ ${Number(value ?? 0).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Informe imprimible de una campaña (Fase 4).
 *
 * Se abre FUERA del layout administrativo para que la impresión salga limpia:
 * el PDF se genera con «Guardar como PDF» del navegador (sin dependencias).
 * Solo muestra datos que el endpoint público de transparencia ya expone.
 */
export default function AdminReportPrint() {
  const params = useParams<{ id?: string }>();
  const id = Number(params.id);
  const [report, setReport] = useState<CampaignReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!Number.isInteger(id) || id <= 0) {
      setError("ID de campaña inválido.");
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetch(`/api/campaigns/${id}/transparency`, { credentials: "include" })
      .then(async (res) => {
        if (!res.ok) throw new Error("No se pudo cargar el informe de la campaña.");
        return (await res.json()) as CampaignReport;
      })
      .then((data) => {
        if (!cancelled) {
          setReport(data);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Error inesperado");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <div className="min-h-screen bg-background p-8 print:p-0">
      {/* Barra de acciones: no se imprime */}
      <div className="max-w-3xl mx-auto mb-6 flex flex-wrap items-center gap-3 print:hidden">
        <Link href="/admin/informes">
          <Button variant="ghost" className="rounded-xl gap-2">
            <ArrowLeft className="w-4 h-4" /> Volver a informes
          </Button>
        </Link>
        <Button
          className="rounded-xl gap-2 ml-auto"
          disabled={!report}
          onClick={() => window.print()}
        >
          <Printer className="w-4 h-4" /> Imprimir / Guardar como PDF
        </Button>
      </div>

      <div className="max-w-3xl mx-auto bg-card border border-border rounded-3xl p-8 print:border-0 print:rounded-none print:p-0">
        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground py-16 justify-center">
            <Loader2 className="w-5 h-5 animate-spin" /> Cargando informe...
          </div>
        ) : error || !report ? (
          <p className="text-destructive py-16 text-center">{error ?? "Sin datos."}</p>
        ) : (
          <article>
            <header className="border-b border-border pb-4 mb-6">
              <p className="text-xs uppercase tracking-widest text-muted-foreground font-semibold">
                Red Solidaria San Ramón · Informe de campaña
              </p>
              <h1 className="text-3xl font-display font-bold text-foreground mt-1">{report.title}</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Campaña #{report.campaignId} · Generado el{" "}
                {formatSafeDate(new Date().toISOString(), "dd/MM/yyyy")}
              </p>
            </header>

            <section className="grid grid-cols-2 gap-4 mb-6">
              <div className="border border-border rounded-2xl p-4">
                <div className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">Meta</div>
                <div className="text-xl font-bold text-foreground">{money(report.goal)}</div>
              </div>
              <div className="border border-border rounded-2xl p-4">
                <div className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">
                  Recaudado
                </div>
                <div className="text-xl font-bold text-foreground">{money(report.totalRaised)}</div>
                <div className="text-xs text-muted-foreground">{report.raisedPercent}% de la meta</div>
              </div>
              <div className="border border-border rounded-2xl p-4">
                <div className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">Gastado</div>
                <div className="text-xl font-bold text-foreground">{money(report.totalSpent)}</div>
                <div className="text-xs text-muted-foreground">{report.executionPercent}% de ejecución</div>
              </div>
              <div className="border border-border rounded-2xl p-4">
                <div className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">Saldo</div>
                <div className="text-xl font-bold text-foreground">{money(report.balance)}</div>
              </div>
            </section>

            <section className="grid grid-cols-3 gap-4 mb-6 text-sm">
              <div>
                <div className="font-semibold text-foreground">Donantes</div>
                <div className="text-muted-foreground">{report.donorCount}</div>
              </div>
              <div>
                <div className="font-semibold text-foreground">Gastos</div>
                <div className="text-muted-foreground">
                  {report.expenseCount} ({report.publicExpenseCount} públicos)
                </div>
              </div>
              <div>
                <div className="font-semibold text-foreground">Evidencias</div>
                <div className="text-muted-foreground">
                  {report.evidenceCount} ({report.publicEvidenceCount} públicas)
                </div>
              </div>
              <div>
                <div className="font-semibold text-foreground">Bienes en inventario</div>
                <div className="text-muted-foreground">
                  {report.leftoverCount} ({report.publicLeftoverCount} públicos)
                </div>
              </div>
            </section>

            <section>
              <h2 className="text-lg font-bold text-foreground mb-2">Últimos movimientos del libro</h2>
              {report.recentMovements.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin movimientos registrados.</p>
              ) : (
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-border text-left">
                      <th className="py-2 pr-3 font-semibold">Fecha</th>
                      <th className="py-2 pr-3 font-semibold">Tipo</th>
                      <th className="py-2 pr-3 font-semibold">Descripción</th>
                      <th className="py-2 text-right font-semibold">Monto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.recentMovements.map((movement, index) => (
                      <tr key={`${movement.date ?? "s"}-${index}`} className="border-b border-border/50">
                        <td className="py-2 pr-3 text-muted-foreground whitespace-nowrap">
                          {movement.date ? formatSafeDate(movement.date, "dd/MM/yy") : "—"}
                        </td>
                        <td className="py-2 pr-3">{movement.type}</td>
                        <td className="py-2 pr-3">{movement.description}</td>
                        <td className="py-2 text-right font-medium whitespace-nowrap">
                          {money(movement.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            <footer className="border-t border-border mt-8 pt-4 text-xs text-muted-foreground">
              Los montos provienen de donaciones confirmadas (aprobadas o conciliadas) y de gastos
              registrados. El libro contable es de solo anexado: las correcciones se registran como
              nuevos movimientos, nunca se editan los existentes.
            </footer>
          </article>
        )}
      </div>
    </div>
  );
}

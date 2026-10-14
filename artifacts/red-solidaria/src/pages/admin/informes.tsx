import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DONATION_STATUS_FILTERS, REPORTS, buildReportUrl } from "@/lib/reports-admin";
import { Download, FileSpreadsheet, Printer } from "lucide-react";

const ALL_STATUSES = "__all__";

/**
 * Informes (Fase 4): descargas CSV compatibles con Excel y acceso al informe
 * imprimible (el navegador genera el PDF). Sin dependencias externas.
 */
export default function AdminInformes() {
  const [status, setStatus] = useState<string>(ALL_STATUSES);
  const [campaignId, setCampaignId] = useState("");

  const parsedCampaignId = Number.parseInt(campaignId, 10);
  const filters = {
    status: status === ALL_STATUSES ? undefined : status,
    campaignId: Number.isInteger(parsedCampaignId) ? parsedCampaignId : null,
  };

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold font-display flex items-center gap-2">
          <FileSpreadsheet className="w-7 h-7 text-primary" /> Informes
        </h1>
        <p className="text-muted-foreground mt-1">
          Exporta la información contable en CSV (se abre directamente en Excel o LibreOffice) e
          imprime informes en PDF desde el navegador.
        </p>
      </div>

      {/* Filtros comunes */}
      <div className="bg-card border border-border rounded-3xl p-6 mb-6">
        <h2 className="text-lg font-bold text-foreground mb-4">Filtros</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="report-status">Estado de donación</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger id="report-status" className="rounded-xl mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_STATUSES}>Todos los estados</SelectItem>
                {DONATION_STATUS_FILTERS.filter((o) => o.value).map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">Aplica al informe de donaciones.</p>
          </div>
          <div>
            <Label htmlFor="report-campaign">ID de campaña (opcional)</Label>
            <Input
              id="report-campaign"
              inputMode="numeric"
              placeholder="Todas las campañas"
              value={campaignId}
              onChange={(e) => setCampaignId(e.target.value.replace(/[^0-9]/g, ""))}
              className="rounded-xl mt-1"
            />
            <p className="text-xs text-muted-foreground mt-1">Aplica a donaciones y al libro contable.</p>
          </div>
        </div>
      </div>

      {/* Descargas */}
      <div className="grid gap-4 sm:grid-cols-2 mb-8">
        {REPORTS.map((report) => (
          <div key={report.id} className="bg-card border border-border rounded-3xl p-6 flex flex-col">
            <h3 className="text-lg font-bold text-foreground">{report.title}</h3>
            <p className="text-sm text-muted-foreground mt-2 flex-1">{report.description}</p>
            <Button asChild className="mt-4 rounded-xl gap-2 h-11">
              <a href={buildReportUrl(report.path, filters)} download>
                <Download className="w-4 h-4" /> Descargar CSV
              </a>
            </Button>
          </div>
        ))}
      </div>

      {/* Informe imprimible (PDF) */}
      <div className="bg-card border border-border rounded-3xl p-6">
        <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
          <Printer className="w-5 h-5 text-primary" /> Informe imprimible (PDF)
        </h2>
        <p className="text-sm text-muted-foreground mt-2">
          Abre el informe de una campaña en una vista limpia y usa «Guardar como PDF» del navegador.
          Indica el ID de la campaña en el filtro de arriba y pulsa el botón.
        </p>
        <Button
          asChild={Number.isInteger(parsedCampaignId) && parsedCampaignId > 0}
          disabled={!Number.isInteger(parsedCampaignId) || parsedCampaignId <= 0}
          variant="outline"
          className="mt-4 rounded-xl gap-2 h-11"
        >
          {Number.isInteger(parsedCampaignId) && parsedCampaignId > 0 ? (
            <Link href={`/admin/informes/${parsedCampaignId}`}>
              <Printer className="w-4 h-4" /> Abrir informe de la campaña #{parsedCampaignId}
            </Link>
          ) : (
            <span>
              <Printer className="w-4 h-4" /> Indica un ID de campaña
            </span>
          )}
        </Button>
      </div>

      <p className="text-xs text-muted-foreground mt-4">
        Los informes son privados e incluyen datos personales del donante: descárgalos solo en
        equipos autorizados. Los montos siguen la fuente de verdad contable (donaciones aprobadas o
        conciliadas).
      </p>
    </div>
  );
}

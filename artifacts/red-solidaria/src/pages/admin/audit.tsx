import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuditLogs } from "@/hooks/use-audit-logs";
import {
  AUDIT_ACTION_LABEL,
  auditActionLabel,
  auditResourceLabel,
  summarizeAuditDetails,
} from "@/lib/audit-admin";
import { formatSafeDate } from "@/lib/i18n/date";
import { RefreshCw, Search, ShieldCheck } from "lucide-react";

const ALL = "__all__";
const RESOURCES = ["donations", "campaigns", "donors", "users", "settings"];

/**
 * Registro de auditoría (Fase 4): quién hizo qué y cuándo.
 * Es la evidencia visible de que ninguna corrección contable es silenciosa.
 * Solo lectura.
 */
export default function AdminAudit() {
  const [action, setAction] = useState<string>(ALL);
  const [resource, setResource] = useState<string>(ALL);
  const [username, setUsername] = useState("");

  const filters = {
    action: action === ALL ? undefined : action,
    resource: resource === ALL ? undefined : resource,
    username: username.trim() || undefined,
    limit: 100,
  };

  const { data: logs, isLoading, isError, isFetching, refetch } = useAuditLogs(filters);
  const entries = logs ?? [];

  return (
    <div className="p-8 max-w-[1400px] mx-auto">
      <div className="flex flex-wrap justify-between items-start gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold font-display flex items-center gap-2">
            <ShieldCheck className="w-7 h-7 text-primary" /> Registro de auditoría
          </h1>
          <p className="text-muted-foreground mt-1">
            Trazabilidad de las acciones administrativas. Solo lectura.
          </p>
        </div>
        <Button
          variant="outline"
          className="rounded-xl gap-2"
          disabled={isFetching}
          onClick={() => void refetch()}
        >
          <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} /> Actualizar
        </Button>
      </div>

      {/* Filtros */}
      <div className="flex flex-col lg:flex-row lg:items-center gap-3 mb-6">
        <div className="w-full lg:w-[280px]">
          <Select value={action} onValueChange={setAction}>
            <SelectTrigger className="rounded-xl" aria-label="Filtrar por acción">
              <SelectValue placeholder="Todas las acciones" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todas las acciones</SelectItem>
              {Object.keys(AUDIT_ACTION_LABEL).map((key) => (
                <SelectItem key={key} value={key}>
                  {auditActionLabel(key)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-full lg:w-[200px]">
          <Select value={resource} onValueChange={setResource}>
            <SelectTrigger className="rounded-xl" aria-label="Filtrar por recurso">
              <SelectValue placeholder="Todos los recursos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos los recursos</SelectItem>
              {RESOURCES.map((key) => (
                <SelectItem key={key} value={key}>
                  {auditResourceLabel(key)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="relative w-full lg:w-auto lg:min-w-[240px] lg:ml-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            type="search"
            placeholder="Buscar por usuario..."
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="pl-9 rounded-xl bg-background"
            aria-label="Buscar por usuario"
          />
        </div>
      </div>

      <div className="bg-card border border-border rounded-3xl shadow-sm overflow-hidden">
        <Table>
          <TableHeader className="bg-secondary/30">
            <TableRow>
              <TableHead className="w-[150px]">Fecha</TableHead>
              <TableHead>Acción</TableHead>
              <TableHead>Recurso</TableHead>
              <TableHead>Usuario</TableHead>
              <TableHead>Detalles</TableHead>
              <TableHead className="w-[130px]">IP</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                  Cargando registro...
                </TableCell>
              </TableRow>
            ) : isError ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12 text-destructive">
                  No se pudo leer el registro de auditoría.
                </TableCell>
              </TableRow>
            ) : entries.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                  No hay acciones registradas con estos filtros.
                </TableCell>
              </TableRow>
            ) : (
              entries.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                    {entry.createdAt ? formatSafeDate(entry.createdAt, "dd/MM/yy HH:mm") : "—"}
                  </TableCell>
                  <TableCell>
                    <span className="font-medium text-foreground">
                      {auditActionLabel(entry.action)}
                    </span>
                    <div className="text-[10px] text-muted-foreground font-mono">{entry.action}</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{auditResourceLabel(entry.resource)}</Badge>
                    {entry.resourceId ? (
                      <span className="text-xs text-muted-foreground ml-2">#{entry.resourceId}</span>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-sm font-medium">{entry.username || "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-[380px] break-words">
                    {summarizeAuditDetails(entry.details)}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground font-mono">
                    {entry.ipAddress || "—"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <p className="text-xs text-muted-foreground mt-4">
        Se registran las aprobaciones y rechazos de donaciones, las conciliaciones bancarias y el
        ciclo de vida de las campañas. Los datos sensibles se redactan automáticamente.
      </p>
    </div>
  );
}

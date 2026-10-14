import { useState } from "react";
import { useGetAdminMe } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCreateObservation, useObservations, useResolveObservation } from "@/hooks/use-observations";
import {
  OBSERVATION_ENTITY_LABEL,
  OBSERVATION_ENTITY_TYPES,
  OBSERVATION_MIN_LENGTH,
  countPending,
  observationEntityLabel,
} from "@/lib/observations-admin";
import { formatSafeDate } from "@/lib/i18n/date";
import { CheckCircle2, ClipboardList, Loader2 } from "lucide-react";

const ALL = "__all__";

/**
 * Observaciones de supervisión (Fase 4).
 *
 * El supervisor (solo consulta) deja constancia de lo que revisa; la
 * observación es un anexo y NUNCA modifica el registro observado. Marcar como
 * atendida corresponde a la administración.
 */
export default function AdminObservations() {
  const [pendingOnly, setPendingOnly] = useState(false);
  const [entityType, setEntityType] = useState<string>(ALL);
  const [entityId, setEntityId] = useState("");
  const [formType, setFormType] = useState<string>("donation");
  const [formEntityId, setFormEntityId] = useState("");
  const [formBody, setFormBody] = useState("");

  const { data: user } = useGetAdminMe({
    query: { queryKey: ["/api/admin/me"], retry: false },
  });
  const canResolve =
    user?.role === "administrador" || user?.role === "superadmin" || user?.id === 0;

  const filters = {
    entityType: entityType === ALL ? undefined : entityType,
    entityId: entityId.trim() || undefined,
    pending: pendingOnly || undefined,
    limit: 200,
  };

  const { data: observations, isLoading, isError } = useObservations(filters);
  const create = useCreateObservation();
  const resolve = useResolveObservation();

  const entries = observations ?? [];
  const pending = countPending(entries);
  const canSubmit =
    formEntityId.trim().length > 0 && formBody.trim().length >= OBSERVATION_MIN_LENGTH;

  const onSubmit = () => {
    create.mutate(
      { entityType: formType, entityId: formEntityId.trim(), body: formBody.trim() },
      {
        onSuccess: () => {
          setFormEntityId("");
          setFormBody("");
        },
      },
    );
  };

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold font-display flex items-center gap-2">
          <ClipboardList className="w-7 h-7 text-primary" /> Observaciones de supervisión
        </h1>
        <p className="text-muted-foreground mt-1">
          Constancia de lo revisado. Las observaciones son anexos: no modifican el registro
          observado ni ningún movimiento contable.
        </p>
      </div>

      {/* Nueva observación */}
      <div className="bg-card border border-border rounded-3xl p-6 mb-6">
        <h2 className="text-lg font-bold text-foreground mb-4">Nueva observación</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="obs-type">Tipo de registro</Label>
            <Select value={formType} onValueChange={setFormType}>
              <SelectTrigger id="obs-type" className="rounded-xl mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OBSERVATION_ENTITY_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {observationEntityLabel(type)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="obs-entity">ID del registro</Label>
            <Input
              id="obs-entity"
              inputMode="numeric"
              placeholder="Ej. 42"
              value={formEntityId}
              onChange={(e) => setFormEntityId(e.target.value.replace(/[^0-9]/g, ""))}
              className="rounded-xl mt-1"
            />
          </div>
        </div>
        <div className="mt-4">
          <Label htmlFor="obs-body">Observación</Label>
          <Textarea
            id="obs-body"
            placeholder={`Describe lo observado (mínimo ${OBSERVATION_MIN_LENGTH} caracteres)`}
            value={formBody}
            onChange={(e) => setFormBody(e.target.value)}
            className="h-24 rounded-xl mt-1"
          />
        </div>
        <Button
          className="mt-4 rounded-xl gap-2 h-11"
          disabled={!canSubmit || create.isPending}
          onClick={onSubmit}
        >
          {create.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
          Registrar observación
        </Button>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <Button
          variant={pendingOnly ? "default" : "outline"}
          className="rounded-xl"
          onClick={() => setPendingOnly((v) => !v)}
          aria-pressed={pendingOnly}
        >
          Solo pendientes {pending > 0 ? `(${pending})` : ""}
        </Button>
        <div className="w-[220px]">
          <Select value={entityType} onValueChange={setEntityType}>
            <SelectTrigger className="rounded-xl" aria-label="Filtrar por tipo de registro">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos los tipos</SelectItem>
              {OBSERVATION_ENTITY_TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  {OBSERVATION_ENTITY_LABEL[type]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Input
          inputMode="numeric"
          placeholder="ID del registro"
          value={entityId}
          onChange={(e) => setEntityId(e.target.value.replace(/[^0-9]/g, ""))}
          className="rounded-xl w-[180px]"
          aria-label="Filtrar por ID de registro"
        />
      </div>

      {/* Listado */}
      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Cargando observaciones...</div>
      ) : isError ? (
        <div className="text-center py-12 text-destructive">
          No se pudieron cargar las observaciones.
        </div>
      ) : entries.length === 0 ? (
        <div className="bg-card border border-border rounded-3xl p-8 text-center text-muted-foreground">
          No hay observaciones con estos filtros.
        </div>
      ) : (
        <div className="space-y-3">
          {entries.map((observation) => (
            <div key={observation.id} className="bg-card border border-border rounded-2xl p-5">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <Badge variant="outline">{observation.entityLabel}</Badge>
                <span className="text-xs text-muted-foreground">#{observation.entityId}</span>
                {observation.resolved ? (
                  <Badge className="bg-emerald-600 hover:bg-emerald-700 border-0 text-white">
                    Atendida
                  </Badge>
                ) : (
                  <Badge className="bg-amber-500 hover:bg-amber-600 border-0 text-white">
                    Pendiente
                  </Badge>
                )}
                <span className="text-xs text-muted-foreground ml-auto">
                  {observation.authorUsername || "—"} ·{" "}
                  {observation.createdAt
                    ? formatSafeDate(observation.createdAt, "dd/MM/yy HH:mm")
                    : "—"}
                </span>
              </div>
              <p className="text-sm text-foreground whitespace-pre-wrap">{observation.body}</p>
              {observation.resolved && (
                <p className="text-xs text-muted-foreground mt-2">
                  Atendida por {observation.resolvedBy || "—"}
                  {observation.resolvedAt
                    ? ` el ${formatSafeDate(observation.resolvedAt, "dd/MM/yyyy")}`
                    : ""}
                </p>
              )}
              {!observation.resolved && canResolve && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3 rounded-lg gap-1.5 text-emerald-600 border-emerald-600/20 hover:bg-emerald-600/10"
                  disabled={resolve.isPending}
                  onClick={() => resolve.mutate(observation.id)}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" /> Marcar como atendida
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-muted-foreground mt-4">
        Solo la administración puede marcar una observación como atendida; queda registrado quién y
        cuándo. Todo queda además en el registro de auditoría.
      </p>
    </div>
  );
}

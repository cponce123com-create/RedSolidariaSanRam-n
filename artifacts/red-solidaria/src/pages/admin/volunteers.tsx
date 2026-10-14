import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  useUpdateVolunteerStatus,
  useVolunteer,
  useVolunteers,
} from "@/hooks/use-volunteers-admin";
import {
  VOLUNTEER_STATUS_TABS,
  decisionSummary,
  trackingLink,
  volunteerStatusBadge,
  volunteerStatusLabel,
  type Volunteer,
} from "@/lib/volunteers-admin";
import { formatSafeDate } from "@/lib/i18n/date";
import { useToast } from "@/hooks/use-toast";
import { Copy, Eye, Link2, Loader2, MapPin, Search, Users } from "lucide-react";

/**
 * Panel de voluntariado (Fase 5).
 *
 * Las acciones de estado se generan a partir de `allowedTransitions` que envía
 * el servidor: la interfaz solo ofrece transiciones que el backend aceptará.
 * Las decisiones quedan trazadas (quién y cuándo) y en el registro de auditoría.
 */
export default function AdminVolunteers() {
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<number | null>(null);

  const filters = useMemo(
    () => ({ status: statusFilter, search: search.trim() || undefined, limit: 300 }),
    [statusFilter, search],
  );

  const { data: volunteers, isLoading, isError } = useVolunteers(filters);
  const entries = volunteers ?? [];
  const pendingCount = entries.filter((v) => v.status === "pending").length;

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex flex-wrap justify-between items-start gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold font-display flex items-center gap-2">
            <Users className="w-7 h-7 text-primary" /> Voluntariado
          </h1>
          <p className="text-muted-foreground mt-1">
            Registro permanente: un correo = una ficha. Las decisiones quedan trazadas.
          </p>
        </div>
        {pendingCount > 0 && (
          <Badge className="bg-yellow-500 hover:bg-yellow-600 border-0 text-white">
            {pendingCount} pendiente{pendingCount > 1 ? "s" : ""}
          </Badge>
        )}
      </div>

      {/* Filtros */}
      <div className="flex flex-col lg:flex-row lg:items-center gap-3 mb-6">
        <div className="flex flex-wrap gap-2 bg-secondary/50 p-1.5 rounded-xl">
          {VOLUNTEER_STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setStatusFilter(tab.value)}
              aria-pressed={statusFilter === tab.value}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                statusFilter === tab.value
                  ? "bg-background shadow text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="relative w-full lg:w-auto lg:min-w-[260px] lg:ml-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            type="search"
            placeholder="Buscar por nombre o correo..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 rounded-xl bg-background"
            aria-label="Buscar voluntarios"
          />
        </div>
      </div>

      {/* Listado */}
      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Cargando postulaciones...</div>
      ) : isError ? (
        <div className="text-center py-12 text-destructive">
          No se pudieron cargar las postulaciones.
        </div>
      ) : entries.length === 0 ? (
        <div className="bg-card border border-border rounded-3xl p-8 text-center text-muted-foreground">
          No hay postulaciones con estos filtros.
        </div>
      ) : (
        <div className="grid gap-3">
          {entries.map((volunteer) => (
            <div
              key={volunteer.id}
              className="bg-card border border-border rounded-2xl p-5 flex flex-wrap items-center gap-4"
            >
              <div className="flex-1 min-w-[220px]">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-foreground">{volunteer.name}</span>
                  <Badge className={`${volunteerStatusBadge(volunteer.status)} border shadow-none`}>
                    {volunteerStatusLabel(volunteer.status)}
                  </Badge>
                </div>
                <div className="text-sm text-muted-foreground mt-1 break-all">
                  {volunteer.email}
                  {volunteer.phone ? ` · ${volunteer.phone}` : ""}
                </div>
                <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2">
                  {volunteer.district && (
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="w-3 h-3" /> {volunteer.district}
                    </span>
                  )}
                  <span>
                    Postuló el{" "}
                    {volunteer.createdAt
                      ? formatSafeDate(volunteer.createdAt, "dd/MM/yyyy")
                      : "—"}
                  </span>
                </div>
              </div>
              <Button
                variant="outline"
                className="rounded-xl gap-2 h-10"
                onClick={() => setOpenId(volunteer.id)}
              >
                <Eye className="w-4 h-4" /> Ver ficha
              </Button>
            </div>
          ))}
        </div>
      )}

      {openId !== null && <VolunteerDialog id={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}

/** Ficha completa con las transiciones válidas que informa el servidor. */
function VolunteerDialog({ id, onClose }: { id: number; onClose: () => void }) {
  const { data: volunteer, isLoading, isError } = useVolunteer(id);
  const updateStatus = useUpdateVolunteerStatus();
  const { toast } = useToast();
  const [notes, setNotes] = useState("");
  const [notesTouched, setNotesTouched] = useState(false);

  const copyTrackingLink = async (volunteerData: Volunteer) => {
    const token = volunteerData.publicToken;
    if (!token) {
      toast({
        title: "Enlace no disponible",
        description: "Esta postulación no tiene token de seguimiento.",
        variant: "destructive",
      });
      return;
    }
    const link = trackingLink(token);
    try {
      await navigator.clipboard.writeText(link);
      toast({ title: "Enlace copiado", description: link });
    } catch {
      toast({ title: "Enlace de seguimiento", description: link });
    }
  };

  const applyStatus = (status: string) => {
    updateStatus.mutate({
      id,
      status,
      ...(notesTouched ? { adminNotes: notes } : {}),
    });
  };

  const trace = volunteer ? decisionSummary(volunteer) : null;

  return (
    <Dialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="sm:max-w-[720px] rounded-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-display">
            {volunteer?.name ?? "Postulación"}
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="py-12 flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" /> Cargando ficha...
          </div>
        ) : isError || !volunteer ? (
          <p className="py-12 text-center text-destructive">No se pudo cargar la ficha.</p>
        ) : (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className={`${volunteerStatusBadge(volunteer.status)} border shadow-none`}>
                {volunteerStatusLabel(volunteer.status)}
              </Badge>
              {trace && <span className="text-xs text-muted-foreground">{trace}</span>}
            </div>

            {/* Datos de contacto (privados) */}
            <div className="grid gap-3 sm:grid-cols-2 text-sm">
              <Field label="Correo" value={volunteer.email} />
              <Field label="Teléfono" value={volunteer.phone} />
              <Field label="Edad" value={volunteer.age} />
              <Field label="Distrito" value={volunteer.district} />
            </div>

            {/* Perfil */}
            <div className="space-y-3 text-sm">
              <Field label="Disponibilidad" value={volunteer.availability} />
              <Field label="Habilidades" value={volunteer.skills} />
              <Field label="Intereses" value={volunteer.interests} />
              <Field label="Experiencia previa" value={volunteer.priorExperience} />
              <Field label="Motivación" value={volunteer.motivation} />
            </div>

            {volunteer.photo && (
              <div>
                <Label>Foto</Label>
                <img
                  src={volunteer.photo}
                  alt={`Foto de ${volunteer.name}`}
                  className="mt-1 h-32 w-32 rounded-2xl object-cover border border-border"
                />
              </div>
            )}

            {/* Notas internas */}
            <div>
              <Label htmlFor="vol-notes">Notas internas</Label>
              <Textarea
                id="vol-notes"
                value={notesTouched ? notes : (volunteer.adminNotes ?? "")}
                onChange={(e) => {
                  setNotes(e.target.value);
                  setNotesTouched(true);
                }}
                className="h-20 rounded-xl mt-1"
                placeholder="Observaciones del equipo (no se muestran al voluntario)"
              />
            </div>

            {/* Acciones: solo transiciones válidas */}
            <div className="flex flex-wrap gap-2 pt-1">
              {volunteer.allowedTransitions.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No hay acciones disponibles para este estado.
                </p>
              ) : (
                volunteer.allowedTransitions.map((next) => (
                  <Button
                    key={next}
                    variant={next === "rejected" ? "outline" : "default"}
                    className={`rounded-xl h-10 ${
                      next === "rejected"
                        ? "text-destructive border-destructive/30 hover:bg-destructive/10"
                        : ""
                    }`}
                    disabled={updateStatus.isPending}
                    onClick={() => applyStatus(next)}
                  >
                    {updateStatus.isPending && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
                    Marcar como {volunteerStatusLabel(next).toLowerCase()}
                  </Button>
                ))
              )}
            </div>

            {/* Enlace de seguimiento */}
            <div className="border-t border-border pt-4">
              <Button
                variant="outline"
                className="rounded-xl gap-2 h-10"
                onClick={() => void copyTrackingLink(volunteer)}
              >
                <Link2 className="w-4 h-4" /> Copiar enlace de seguimiento
                <Copy className="w-3.5 h-3.5 opacity-60" />
              </Button>
              <p className="text-xs text-muted-foreground mt-2">
                Envíalo al voluntario: verá su estado en una página pública, sin exponer sus datos.
              </p>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">
        {label}
      </div>
      <div className="text-foreground whitespace-pre-wrap">{value || "—"}</div>
    </div>
  );
}

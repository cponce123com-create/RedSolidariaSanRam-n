import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useSaveTeam, useTeams } from "@/hooks/use-volunteer-teams-admin";
import type { TeamInput, VolunteerTeam } from "@/lib/volunteer-teams-admin";
import { ArrowLeft, Loader2, Plus, Users } from "lucide-react";

const EMPTY_FORM: TeamInput = { name: "", description: "", color: "" };

/**
 * Equipos de voluntariado (Fase 5).
 *
 * Un equipo no se borra: se DESACTIVA, de modo que el historial de pertenencias
 * sigue siendo interpretable.
 */
export default function AdminVolunteerTeams() {
  const { data: teams, isLoading, isError } = useTeams();
  const { create, update } = useSaveTeam();

  const [isOpen, setIsOpen] = useState(false);
  const [editing, setEditing] = useState<VolunteerTeam | null>(null);
  const [form, setForm] = useState<TeamInput>(EMPTY_FORM);

  const entries = teams ?? [];
  const activeCount = entries.filter((t) => t.isActive).length;

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setIsOpen(true);
  };

  const openEdit = (team: VolunteerTeam) => {
    setEditing(team);
    setForm({
      name: team.name,
      description: team.description ?? "",
      color: team.color ?? "",
      isActive: team.isActive,
    });
    setIsOpen(true);
  };

  const onSubmit = () => {
    if (!form.name.trim()) return;
    const onDone = () => {
      setIsOpen(false);
      setEditing(null);
      setForm(EMPTY_FORM);
    };
    if (editing) update.mutate({ id: editing.id, input: form }, { onSuccess: onDone });
    else create.mutate(form, { onSuccess: onDone });
  };

  const toggleActive = (team: VolunteerTeam) => {
    update.mutate({
      id: team.id,
      input: {
        name: team.name,
        description: team.description,
        color: team.color,
        isActive: !team.isActive,
      },
    });
  };

  const saving = create.isPending || update.isPending;

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex flex-wrap justify-between items-start gap-4 mb-6">
        <div>
          <Link href="/admin/voluntarios">
            <Button variant="ghost" className="rounded-xl gap-2 -ml-2 mb-2">
              <ArrowLeft className="w-4 h-4" /> Volver a voluntariado
            </Button>
          </Link>
          <h1 className="text-3xl font-bold font-display flex items-center gap-2">
            <Users className="w-7 h-7 text-primary" /> Equipos
          </h1>
          <p className="text-muted-foreground mt-1">
            {activeCount} equipo{activeCount === 1 ? "" : "s"} activo
            {activeCount === 1 ? "" : "s"}. Los equipos no se borran: se desactivan.
          </p>
        </div>

        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button className="rounded-xl gap-2 h-11" onClick={openCreate}>
              <Plus className="w-4 h-4" /> Nuevo equipo
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[520px] rounded-3xl">
            <DialogHeader>
              <DialogTitle className="text-2xl font-display">
                {editing ? "Editar equipo" : "Nuevo equipo"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="team-name">Nombre</Label>
                <Input
                  id="team-name"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="rounded-xl mt-1"
                />
              </div>
              <div>
                <Label htmlFor="team-description">Descripción</Label>
                <Textarea
                  id="team-description"
                  value={form.description ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  className="h-20 rounded-xl mt-1"
                />
              </div>
              <div>
                <Label htmlFor="team-color">Color (opcional)</Label>
                <Input
                  id="team-color"
                  placeholder="#22c55e"
                  value={form.color ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
                  className="rounded-xl mt-1"
                />
              </div>
              <Button
                className="w-full h-12 rounded-xl text-lg"
                disabled={!form.name.trim() || saving}
                onClick={onSubmit}
              >
                {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {editing ? "Guardar cambios" : "Crear equipo"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Cargando equipos...</div>
      ) : isError ? (
        <div className="text-center py-12 text-destructive">No se pudieron cargar los equipos.</div>
      ) : entries.length === 0 ? (
        <div className="bg-card border border-border rounded-3xl p-8 text-center text-muted-foreground">
          Todavía no hay equipos. Crea el primero para organizar al voluntariado.
        </div>
      ) : (
        <div className="grid gap-3">
          {entries.map((team) => (
            <div
              key={team.id}
              className="bg-card border border-border rounded-2xl p-5 flex flex-wrap items-center gap-4"
            >
              <span
                aria-hidden
                className="w-3 h-10 rounded-full shrink-0"
                style={{ backgroundColor: team.color || "var(--border)" }}
              />
              <div className="flex-1 min-w-[200px]">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-foreground">{team.name}</span>
                  {team.isActive ? (
                    <Badge className="bg-emerald-600 hover:bg-emerald-700 border-0 text-white">
                      Activo
                    </Badge>
                  ) : (
                    <Badge variant="outline">Desactivado</Badge>
                  )}
                </div>
                {team.description ? (
                  <p className="text-sm text-muted-foreground mt-1">{team.description}</p>
                ) : null}
                <p className="text-xs text-muted-foreground mt-1">
                  {team.activeMembers} miembro{team.activeMembers === 1 ? "" : "s"} activo
                  {team.activeMembers === 1 ? "" : "s"}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  className="rounded-xl h-10"
                  onClick={() => openEdit(team)}
                >
                  Editar
                </Button>
                <Button
                  variant="outline"
                  className="rounded-xl h-10"
                  disabled={update.isPending}
                  onClick={() => toggleActive(team)}
                >
                  {team.isActive ? "Desactivar" : "Reactivar"}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-muted-foreground mt-4">
        Un voluntario puede pertenecer a varios equipos. Al retirarlo de un equipo se cierra la
        vigencia y la pertenencia queda en el historial.
      </p>
    </div>
  );
}

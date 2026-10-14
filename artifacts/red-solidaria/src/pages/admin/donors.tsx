import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDonors, useDuplicateGroups, useSaveDonor } from "@/hooks/use-donors-admin";
import {
  DONOR_TYPES,
  donationStatusBadge,
  donationStatusLabel,
  donorTypeLabel,
  type DonorInput,
  type DonorWithTotals,
} from "@/lib/donors-admin";
import { formatSafeDate } from "@/lib/i18n/date";
import { Plus, Search, Loader2, Star, AlertTriangle, ExternalLink } from "lucide-react";

type Tab = "donors" | "duplicates";

const EMPTY_FORM: DonorInput = {
  type: "individual",
  name: "",
  email: "",
  phone: "",
  isRecurring: false,
  notes: "",
};

/**
 * Panel de DONANTES (Fase 3). Los datos son privados: la API exige sesión.
 * Incluye el listado de perfiles y la vista de posibles duplicados.
 */
export default function AdminDonors() {
  const [tab, setTab] = useState<Tab>("donors");
  const [search, setSearch] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [editing, setEditing] = useState<DonorWithTotals | null>(null);
  const [form, setForm] = useState<DonorInput>(EMPTY_FORM);

  const { data: donors, isLoading, isError } = useDonors();
  const { data: duplicateGroups, isLoading: loadingDuplicates } = useDuplicateGroups();
  const { create, update } = useSaveDonor();

  const query = search.trim().toLowerCase();
  const filtered = (donors ?? []).filter((d) => {
    if (!query) return true;
    return (
      d.name.toLowerCase().includes(query) ||
      (d.email ?? "").toLowerCase().includes(query) ||
      (d.phone ?? "").toLowerCase().includes(query)
    );
  });

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setIsOpen(true);
  };

  const openEdit = (donor: DonorWithTotals) => {
    setEditing(donor);
    setForm({
      type: (donor.type as DonorInput["type"]) ?? "individual",
      name: donor.name,
      email: donor.email ?? "",
      phone: donor.phone ?? "",
      isRecurring: donor.isRecurring,
      notes: donor.notes ?? "",
    });
    setIsOpen(true);
  };

  const onSubmit = () => {
    if (!form.name.trim()) return;
    const payload: DonorInput = { ...form, name: form.name.trim() };
    const onDone = () => {
      setIsOpen(false);
      setEditing(null);
      setForm(EMPTY_FORM);
    };
    if (editing) update.mutate({ id: editing.id, input: payload }, { onSuccess: onDone });
    else create.mutate(payload, { onSuccess: onDone });
  };

  const saving = create.isPending || update.isPending;
  const duplicatesCount = duplicateGroups?.length ?? 0;

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex flex-wrap justify-between items-center gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold font-display">Donantes</h1>
          <p className="text-muted-foreground mt-1">
            Perfiles de personas, familias, empresas y organizaciones. Información privada del panel.
          </p>
        </div>
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2 rounded-xl h-11 shadow-sm hover-elevate" onClick={openCreate}>
              <Plus className="w-4 h-4" /> Nuevo donante
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[560px] rounded-3xl">
            <DialogHeader>
              <DialogTitle className="text-2xl font-display">
                {editing ? "Editar donante" : "Nuevo donante"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="donor-type">Tipo</Label>
                  <Select
                    value={form.type}
                    onValueChange={(v) => setForm((f) => ({ ...f, type: v as DonorInput["type"] }))}
                  >
                    <SelectTrigger id="donor-type" className="rounded-xl mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DONOR_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {donorTypeLabel(t)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="donor-name">Nombre</Label>
                  <Input
                    id="donor-name"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    className="rounded-xl mt-1"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="donor-email">Correo</Label>
                  <Input
                    id="donor-email"
                    type="email"
                    value={form.email ?? ""}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                    className="rounded-xl mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="donor-phone">Teléfono</Label>
                  <Input
                    id="donor-phone"
                    value={form.phone ?? ""}
                    onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                    className="rounded-xl mt-1"
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={form.isRecurring ?? false}
                  onChange={(e) => setForm((f) => ({ ...f, isRecurring: e.target.checked }))}
                  className="h-4 w-4 rounded border-border"
                />
                Donante recurrente
              </label>
              <div>
                <Label htmlFor="donor-notes">Notas (privadas)</Label>
                <Textarea
                  id="donor-notes"
                  value={form.notes ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  className="h-20 rounded-xl mt-1"
                />
              </div>
              <Button
                className="w-full h-12 rounded-xl text-lg"
                disabled={!form.name.trim() || saving}
                onClick={onSubmit}
              >
                {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {editing ? "Guardar cambios" : "Crear donante"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Pestañas */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="flex gap-2 bg-secondary/50 p-1.5 rounded-xl">
          <button
            onClick={() => setTab("donors")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === "donors" ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Donantes
          </button>
          <button
            onClick={() => setTab("duplicates")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors inline-flex items-center gap-2 ${
              tab === "duplicates" ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <AlertTriangle className="w-4 h-4" /> Duplicados
            {duplicatesCount > 0 && (
              <span className="inline-flex items-center rounded-md bg-destructive px-2 py-0.5 text-xs font-semibold text-destructive-foreground">
                {duplicatesCount}
              </span>
            )}
          </button>
        </div>
        {tab === "donors" && (
          <div className="relative w-full lg:w-auto lg:min-w-[260px] lg:ml-auto">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input
              type="search"
              placeholder="Buscar por nombre, correo o teléfono..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 rounded-xl bg-background"
              aria-label="Buscar donantes"
            />
          </div>
        )}
      </div>

      {tab === "donors" ? (
        <div className="bg-card border border-border rounded-3xl shadow-sm overflow-hidden">
          <Table>
            <TableHeader className="bg-secondary/30">
              <TableRow>
                <TableHead>Donante</TableHead>
                <TableHead>Contacto</TableHead>
                <TableHead className="text-right">Donaciones</TableHead>
                <TableHead className="text-right">Confirmado</TableHead>
                <TableHead>Alta</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                    Cargando donantes...
                  </TableCell>
                </TableRow>
              ) : isError ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-12 text-destructive">
                    No se pudieron cargar los donantes.
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                    No hay donantes registrados.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((donor) => (
                  <TableRow key={donor.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-foreground">{donor.name}</span>
                        {donor.isRecurring && <Star className="w-3.5 h-3.5 fill-yellow-400 text-yellow-500" />}
                      </div>
                      <Badge variant="outline" className="mt-1">{donorTypeLabel(donor.type)}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      <div>{donor.email || "—"}</div>
                      <div>{donor.phone || ""}</div>
                    </TableCell>
                    <TableCell className="text-right font-medium">{donor.donationCount}</TableCell>
                    <TableCell className="text-right font-bold">
                      S/ {donor.confirmedTotal.toLocaleString("es-PE")}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {donor.createdAt ? formatSafeDate(donor.createdAt, "dd/MM/yy") : "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap justify-end gap-1.5">
                        <Link href={`/admin/donantes/${donor.id}`}>
                          <Button variant="outline" size="sm" className="h-8 rounded-lg text-xs font-medium">
                            <ExternalLink className="w-3.5 h-3.5 mr-1.5" /> Ficha
                          </Button>
                        </Link>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 rounded-lg text-xs font-medium"
                          onClick={() => openEdit(donor)}
                        >
                          Editar
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Posibles duplicados detectados por <strong>correo + monto + día</strong>. Un doble envío del
            formulario cae el mismo día con segundos distintos; revísalos y conserva solo la donación real.
          </p>
          {loadingDuplicates ? (
            <div className="text-center py-12 text-muted-foreground">Analizando donaciones...</div>
          ) : duplicatesCount === 0 ? (
            <div className="bg-card border border-border rounded-3xl p-8 text-center text-muted-foreground">
              No se detectaron duplicados.
            </div>
          ) : (
            duplicateGroups?.map((group) => (
              <div key={group.key} className="bg-card border border-border rounded-3xl p-5">
                <div className="flex items-center gap-2 mb-3">
                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                  <span className="font-semibold text-foreground">
                    {group.count} donaciones coincidentes
                  </span>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ID</TableHead>
                      <TableHead>Donante</TableHead>
                      <TableHead className="text-right">Monto</TableHead>
                      <TableHead>Método</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead>Fecha</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {group.donations.map((d) => (
                      <TableRow key={d.id}>
                        <TableCell className="text-sm text-muted-foreground">#{d.id}</TableCell>
                        <TableCell className="font-medium">{d.name || "—"}</TableCell>
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
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

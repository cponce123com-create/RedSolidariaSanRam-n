import { useState } from "react";
import { Link } from "wouter";
import {
  useGetAdminMe,
  useGetCampaigns,
  useCreateCampaign,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Form, FormControl, FormField, FormItem, FormLabel } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { formatSafeDate } from "@/lib/i18n/date";
import { Plus, Trash2, Edit, Star, Search, Loader2, MoreVertical, ShieldAlert } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { ProtagonistToggle } from "@/components/admin/ProtagonistToggle";
import { CampaignDeletionDialog } from "@/components/admin/CampaignDeletionDialog";
import { CampaignDemoPurgeDialog } from "@/components/admin/CampaignDemoPurgeDialog";
import { useCampaignLifecycle } from "@/hooks/use-campaign-lifecycle";
import {
  campaignStatusBadge,
  campaignStatusLabel,
  errorMessage,
  invalidateCampaignQueries,
  lifecycleActions,
} from "@/lib/campaign-admin";

const formSchema = z.object({
  title: z.string().min(3),
  description: z.string().min(10),
  goal: z.coerce.number().min(1),
  category: z.string().min(2),
  status: z.enum(["draft", "active", "paused", "completed"]),
  featured: z.boolean().default(false),
  startDate: z.string(),
  imageUrl: z.string().optional(),
});

type FilterStatus = "all" | "draft" | "active" | "paused" | "completed" | "archived";

const FILTER_TABS: { value: FilterStatus; label: string }[] = [
  { value: "all", label: "Todas" },
  { value: "draft", label: "Borradores" },
  { value: "active", label: "Activas" },
  { value: "paused", label: "Pausadas" },
  { value: "completed", label: "Finalizadas" },
  { value: "archived", label: "Archivadas" },
];

/** Criterios de ordenación de la lista (locales: no vuelven a pedir al API). */
type SortOption = "recent" | "oldest" | "title" | "goal" | "raised";

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "recent", label: "Más recientes" },
  { value: "oldest", label: "Más antiguas" },
  { value: "title", label: "Título (A-Z)" },
  { value: "goal", label: "Meta (mayor)" },
  { value: "raised", label: "Recaudado (mayor)" },
];

export default function AdminCampaigns() {
  const [filter, setFilter] = useState<FilterStatus>("all");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("recent");
  const apiFilter = filter === "all" ? undefined : filter;
  const { data: campaigns, isLoading } = useGetCampaigns(apiFilter ? { status: apiFilter } : undefined);
  const createMutation = useCreateCampaign();
  const { setStatus } = useCampaignLifecycle();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  // Gestión del borrado (Fase 1.4): el diálogo carga el diagnóstico del servidor
  // antes de mostrar ninguna acción. `manageId === null` = cerrado.
  const [manageId, setManageId] = useState<number | null>(null);
  const [manageTitle, setManageTitle] = useState("");
  // Purga definitiva de campañas DEMO (V7.2): exclusiva del superadmin. El
  // análisis y la confirmación viven en `CampaignDemoPurgeDialog`.
  const [demoId, setDemoId] = useState<number | null>(null);
  const [demoTitle, setDemoTitle] = useState("");
  const { data: adminUser } = useGetAdminMe({
    query: { queryKey: ["/api/admin/me"], retry: false },
  });
  const isSuperadmin = adminUser?.role === "superadmin";

  // Búsqueda local por título o categoría + ordenación de lo visible. El
  // servidor ya devuelve la lista filtrada por estado; aquí solo se reordena.
  const query = search.trim().toLowerCase();
  const filteredCampaigns = (campaigns ?? [])
    .filter((c) => {
      if (!query) return true;
      return (
        c.title.toLowerCase().includes(query) ||
        (c.category ?? "").toLowerCase().includes(query)
      );
    })
    .sort((a, b) => {
      switch (sortBy) {
        case "title":
          return a.title.localeCompare(b.title, "es");
        case "goal":
          return b.goal - a.goal;
        case "raised":
          return b.raised - a.raised;
        case "oldest":
          return (a.startDate ?? "").localeCompare(b.startDate ?? "");
        case "recent":
        default:
          return (b.startDate ?? "").localeCompare(a.startDate ?? "");
      }
    });

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: "", description: "", goal: 0, category: "Salud", status: "draft", featured: false, startDate: new Date().toISOString().split('T')[0]
    }
  });

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    // Toda campaña nace como BORRADOR (no publicada): se publica después desde
    // la propia fila. Evita que un borrador incompleto aparezca en el sitio.
    createMutation.mutate({ data: { ...values, status: "draft", raised: 0 } }, {
      onSuccess: () => {
        toast({ title: "Campaña creada como borrador", description: "Publícala cuando esté lista." });
        invalidateCampaignQueries(queryClient);
        setIsOpen(false);
        form.reset();
      },
      onError: (err) => {
        toast({
          title: "No se pudo crear la campaña",
          description: errorMessage(err, "Revisa los datos e inténtalo de nuevo."),
          variant: "destructive",
        });
      },
    });
  };

  const runAction = (id: number, label: string, confirmText: string | undefined, status: Parameters<typeof setStatus.mutate>[0]["status"]) => {
    if (confirmText && !confirm(confirmText)) return;
    setStatus.mutate({ id, status });
  };

  // El borrado deja de ser un `confirm()` genérico: se abre el diálogo que
  // consulta el diagnóstico del servidor y explica las dependencias reales.
  const openManage = (id: number, title: string) => {
    setManageId(id);
    setManageTitle(title);
  };

  // Purga definitiva de campañas DEMO: solo desde «Más acciones» y solo para el
  // superadmin. El diálogo muestra el análisis de seguridad antes de permitir
  // cualquier confirmación.
  const openDemoPurge = (id: number, title: string) => {
    setDemoId(id);
    setDemoTitle(title);
  };

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold font-display">Gestión de Campañas</h1>
          <p className="text-muted-foreground mt-1">Crea, publica, pausa, archiva y administra las campañas solidarias.</p>
        </div>

        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2 rounded-xl h-11 shadow-sm hover-elevate"><Plus className="w-4 h-4"/> Nueva Campaña</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[600px] rounded-3xl">
            <DialogHeader>
              <DialogTitle className="text-2xl font-display">Crear Nueva Campaña</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground -mt-2">
              Se creará como <strong>borrador</strong> (oculta al público) hasta que la publiques.
            </p>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField control={form.control} name="title" render={({ field }) => (
                  <FormItem><FormLabel>Título</FormLabel><FormControl><Input className="rounded-xl" {...field} /></FormControl></FormItem>
                )} />
                <div className="grid grid-cols-2 gap-4">
                  <FormField control={form.control} name="category" render={({ field }) => (
                    <FormItem><FormLabel>Categoría</FormLabel><FormControl><Input className="rounded-xl" {...field} /></FormControl></FormItem>
                  )} />
                  <FormField control={form.control} name="goal" render={({ field }) => (
                    <FormItem><FormLabel>Meta (S/)</FormLabel><FormControl><Input type="number" className="rounded-xl" {...field} /></FormControl></FormItem>
                  )} />
                </div>
                <FormField control={form.control} name="startDate" render={({ field }) => (
                  <FormItem><FormLabel>Fecha Inicio</FormLabel><FormControl><Input type="date" className="rounded-xl" {...field} /></FormControl></FormItem>
                )} />
                <FormField control={form.control} name="description" render={({ field }) => (
                  <FormItem><FormLabel>Descripción</FormLabel><FormControl><Textarea className="h-24 rounded-xl" {...field} /></FormControl></FormItem>
                )} />
                <Button type="submit" className="w-full h-12 rounded-xl text-lg mt-4" disabled={createMutation.isPending}>
                  {createMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Guardar borrador
                </Button>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters + Search */}
      <div className="flex flex-col lg:flex-row lg:items-center gap-3 mb-6">
        <div className="flex gap-2 bg-secondary/50 p-1.5 rounded-xl inline-flex overflow-x-auto">
          {FILTER_TABS.map(tab => (
            <button
              key={tab.value}
              onClick={() => setFilter(tab.value)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${filter === tab.value ? 'bg-background shadow text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-background/50'}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="relative w-full lg:w-auto lg:min-w-[260px] lg:ml-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            type="search"
            placeholder="Buscar por título o categoría..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 rounded-xl bg-background"
            aria-label="Buscar campañas"
          />
        </div>
        <div className="flex items-center gap-2">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            aria-label="Ordenar campañas"
            className="h-10 rounded-xl border border-border bg-background px-3 text-sm text-foreground"
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="bg-card border border-border rounded-3xl shadow-sm overflow-hidden">
        <Table>
          <TableHeader className="bg-secondary/30">
            <TableRow>
              <TableHead className="w-[26%]">Campaña</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="w-[20%]">Recaudación</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={5} className="text-center py-12 text-muted-foreground">Cargando campañas...</TableCell></TableRow>
            ) : filteredCampaigns.map((c) => {
              const progress = c.goal > 0 ? Math.min(100, Math.round((c.raised / c.goal) * 100)) : 0;
              const actions = lifecycleActions(c.status);
              const busy = setStatus.isPending;
              return (
                <TableRow key={c.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="font-semibold text-foreground truncate max-w-[180px] xl:max-w-[280px]">{c.title}</div>
                      {c.featured && <Star className="w-3.5 h-3.5 fill-yellow-400 text-yellow-500" />}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">{c.category}</div>
                  </TableCell>
                  <TableCell>
                    <Badge className={`${campaignStatusBadge(c.status)} border-0 shadow-sm px-3`}>
                      {campaignStatusLabel(c.status)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-between items-end mb-1">
                      <div className="font-bold text-sm">S/ {c.raised.toLocaleString()}</div>
                      <div className="text-xs text-muted-foreground">{progress}%</div>
                    </div>
                    <Progress value={progress} className="h-1.5" />
                    <div className="text-[10px] text-muted-foreground mt-1 text-right">Meta: S/ {c.goal.toLocaleString()}</div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground font-medium">
                    {formatSafeDate(c.startDate, "dd/MM/yy")}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap justify-end gap-1.5">
                      {actions.map((action) => (
                        <Button
                          key={action.status}
                          variant="outline"
                          size="sm"
                          className="h-8 rounded-lg text-xs font-medium"
                          disabled={busy}
                          onClick={() => runAction(c.id, action.label, action.confirm, action.status)}
                        >
                          {action.label}
                        </Button>
                      ))}
                      <ProtagonistToggle campaignId={c.id} />
                      <Link href={`/admin/campanas/${c.id}`}>
                        <Button variant="outline" size="sm" className="h-8 rounded-lg text-xs font-medium">
                          <Edit className="w-3.5 h-3.5 mr-1.5" /> Editar
                        </Button>
                      </Link>
                      <Button
                        variant="outline"
                        size="sm"
                        aria-label={`Gestionar la campaña ${c.title}: dependencias, archivar o eliminar`}
                        className="h-8 rounded-lg text-xs font-medium gap-1.5 text-destructive border-destructive/20 hover:bg-destructive/10"
                        disabled={busy}
                        onClick={() => openManage(c.id, c.title)}
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Gestionar
                      </Button>
                      {isSuperadmin && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              aria-label={`Más acciones para la campaña ${c.title}`}
                              className="h-8 rounded-lg text-xs font-medium gap-1.5"
                              disabled={busy}
                            >
                              <MoreVertical className="w-3.5 h-3.5" /> Más acciones
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-72">
                            <DropdownMenuLabel>Operaciones de superadmin</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="gap-2 text-destructive focus:text-destructive"
                              onSelect={() => openDemoPurge(c.id, c.title)}
                            >
                              <ShieldAlert className="w-4 h-4" />
                              Eliminar campaña DEMO
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
            {!isLoading && filteredCampaigns.length === 0 && (
              <TableRow><TableCell colSpan={5} className="text-center py-12 text-muted-foreground">No se encontraron campañas.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <p className="text-xs text-muted-foreground mt-4">
        Una campaña con historial financiero no se elimina: se <strong>archiva</strong> para conservar
        sus registros. Pulsa <strong>Gestionar</strong> en cualquier campaña para ver sus dependencias
        concretas y las operaciones permitidas.
        {isSuperadmin && (
          <>
            {" "}
            Las campañas de <strong>demostración</strong> se eliminan definitivamente desde{" "}
            <strong>Más acciones → Eliminar campaña DEMO</strong>; el servidor vuelve a analizar los
            datos antes de borrar y guarda un respaldo verificable.
          </>
        )}
      </p>

      <CampaignDeletionDialog
        campaignId={manageId}
        title={manageTitle}
        open={manageId !== null}
        onOpenChange={(next) => {
          if (!next) setManageId(null);
        }}
      />

      <CampaignDemoPurgeDialog
        campaignId={demoId}
        title={demoTitle}
        open={demoId !== null}
        onOpenChange={(next) => {
          if (!next) setDemoId(null);
        }}
      />
    </div>
  );
}

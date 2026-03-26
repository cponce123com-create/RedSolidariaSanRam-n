import { useState } from "react";
import { Link } from "wouter";
import { useGetCampaigns, useCreateCampaign, useDeleteCampaign } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { format } from "date-fns";
import { Plus, Trash2, Edit, Star } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

const formSchema = z.object({
  title: z.string().min(3),
  description: z.string().min(10),
  goal: z.coerce.number().min(1),
  category: z.string().min(2),
  status: z.enum(["active", "completed", "paused"]),
  featured: z.boolean().default(false),
  startDate: z.string(),
  imageUrl: z.string().optional(),
});

type FilterStatus = "all" | "active" | "paused" | "completed";

export default function AdminCampaigns() {
  const [filter, setFilter] = useState<FilterStatus>("all");
  const apiFilter = filter === "all" ? undefined : filter;
  const { data: campaigns, isLoading } = useGetCampaigns(apiFilter ? { status: apiFilter } : undefined);
  const createMutation = useCreateCampaign();
  const deleteMutation = useDeleteCampaign();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: "", description: "", goal: 0, category: "Salud", status: "active", featured: false, startDate: new Date().toISOString().split('T')[0]
    }
  });

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    createMutation.mutate({ data: { ...values, raised: 0 } }, {
      onSuccess: () => {
        toast({ title: "Campaña creada" });
        queryClient.invalidateQueries({ queryKey: ["/api/campaigns"] });
        setIsOpen(false);
        form.reset();
      }
    });
  };

  const handleDelete = (id: number) => {
    if(confirm("¿Seguro que deseas eliminar esta campaña? Perderás todo el historial de donaciones asociado.")) {
      deleteMutation.mutate({ id }, {
        onSuccess: () => {
          toast({ title: "Campaña eliminada" });
          queryClient.invalidateQueries({ queryKey: ["/api/campaigns"] });
        }
      });
    }
  };

  const statusLabels = {
    active: "Activa",
    paused: "Pausada",
    completed: "Finalizada"
  };

  const statusColors = {
    active: "bg-accent hover:bg-accent/90",
    paused: "bg-yellow-500 hover:bg-yellow-600",
    completed: "bg-secondary text-foreground hover:bg-secondary/80"
  };

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold font-display">Gestión de Campañas</h1>
          <p className="text-muted-foreground mt-1">Crea y administra las campañas solidarias y su progreso.</p>
        </div>

        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2 rounded-xl h-11 shadow-sm hover-elevate"><Plus className="w-4 h-4"/> Nueva Campaña</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[600px] rounded-3xl">
            <DialogHeader>
              <DialogTitle className="text-2xl font-display">Crear Nueva Campaña</DialogTitle>
            </DialogHeader>
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
                  Guardar Campaña
                </Button>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex gap-2 mb-6 bg-secondary/50 p-1.5 rounded-xl inline-flex">
        {(["all", "active", "paused", "completed"] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setFilter(tab)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${filter === tab ? 'bg-background shadow text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-background/50'}`}
          >
            {tab === "all" ? "Todas" : statusLabels[tab]}
          </button>
        ))}
      </div>

      <div className="bg-card border border-border rounded-3xl shadow-sm overflow-hidden">
        <Table>
          <TableHeader className="bg-secondary/30">
            <TableRow>
              <TableHead className="w-[30%]">Campaña</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="w-[25%]">Recaudación</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={5} className="text-center py-12 text-muted-foreground">Cargando campañas...</TableCell></TableRow>
            ) : campaigns?.map((c) => {
              const progress = Math.min(100, Math.round((c.raised / c.goal) * 100)) || 0;
              return (
                <TableRow key={c.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="font-semibold text-foreground truncate max-w-[200px] xl:max-w-[300px]">{c.title}</div>
                      {c.featured && <Star className="w-3.5 h-3.5 fill-yellow-400 text-yellow-500" />}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">{c.category}</div>
                  </TableCell>
                  <TableCell>
                    <Badge className={`${statusColors[c.status]} border-0 shadow-sm px-3`}>
                      {statusLabels[c.status]}
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
                    {format(new Date(c.startDate), "dd/MM/yy")}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Link href={`/admin/campanas/${c.id}`}>
                        <Button variant="outline" size="sm" className="h-8 rounded-lg text-xs font-medium">
                          <Edit className="w-3.5 h-3.5 mr-1.5" /> Editar
                        </Button>
                      </Link>
                      <Button variant="outline" size="icon" className="h-8 w-8 rounded-lg text-destructive border-destructive/20 hover:bg-destructive/10" onClick={() => handleDelete(c.id)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
            {campaigns?.length === 0 && (
              <TableRow><TableCell colSpan={5} className="text-center py-12 text-muted-foreground">No se encontraron campañas.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

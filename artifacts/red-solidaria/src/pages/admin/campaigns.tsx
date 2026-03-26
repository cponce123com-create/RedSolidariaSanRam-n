import { useState } from "react";
import { useGetCampaigns, useCreateCampaign, useDeleteCampaign } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { format } from "date-fns";
import { Plus, Trash2, Edit } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

const formSchema = z.object({
  title: z.string().min(3),
  description: z.string().min(10),
  goal: z.coerce.number().min(1),
  category: z.string().min(2),
  status: z.enum(["active", "completed"]),
  featured: z.boolean().default(false),
  startDate: z.string(),
  imageUrl: z.string().optional(),
});

export default function AdminCampaigns() {
  const { data: campaigns, isLoading } = useGetCampaigns();
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
    if(confirm("¿Seguro que deseas eliminar esta campaña?")) {
      deleteMutation.mutate({ id }, {
        onSuccess: () => {
          toast({ title: "Campaña eliminada" });
          queryClient.invalidateQueries({ queryKey: ["/api/campaigns"] });
        }
      });
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold font-display">Gestión de Campañas</h1>
          <p className="text-muted-foreground mt-1">Crea y administra las campañas solidarias.</p>
        </div>

        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2 rounded-xl h-11"><Plus className="w-4 h-4"/> Nueva Campaña</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[600px] rounded-2xl">
            <DialogHeader>
              <DialogTitle>Crear Nueva Campaña</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField control={form.control} name="title" render={({ field }) => (
                  <FormItem><FormLabel>Título</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>
                )} />
                <FormField control={form.control} name="category" render={({ field }) => (
                  <FormItem><FormLabel>Categoría</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>
                )} />
                <FormField control={form.control} name="goal" render={({ field }) => (
                  <FormItem><FormLabel>Meta (S/)</FormLabel><FormControl><Input type="number" {...field} /></FormControl></FormItem>
                )} />
                <FormField control={form.control} name="startDate" render={({ field }) => (
                  <FormItem><FormLabel>Fecha Inicio</FormLabel><FormControl><Input type="date" {...field} /></FormControl></FormItem>
                )} />
                <FormField control={form.control} name="description" render={({ field }) => (
                  <FormItem><FormLabel>Descripción</FormLabel><FormControl><Textarea className="h-24" {...field} /></FormControl></FormItem>
                )} />
                <Button type="submit" className="w-full h-11 rounded-xl" disabled={createMutation.isPending}>
                  Guardar Campaña
                </Button>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
        <Table>
          <TableHeader className="bg-secondary/50">
            <TableRow>
              <TableHead>Campaña</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Recaudación</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={5} className="text-center py-8">Cargando...</TableCell></TableRow>
            ) : campaigns?.map((c) => (
              <TableRow key={c.id}>
                <TableCell>
                  <div className="font-medium text-foreground">{c.title}</div>
                  <div className="text-xs text-muted-foreground">{c.category}</div>
                </TableCell>
                <TableCell>
                  <Badge variant={c.status === 'active' ? 'default' : 'secondary'} className={c.status==='active'?'bg-accent':''}>
                    {c.status === 'active' ? 'Activa' : 'Finalizada'}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="font-medium">S/ {c.raised}</div>
                  <div className="text-xs text-muted-foreground">de S/ {c.goal}</div>
                </TableCell>
                <TableCell className="text-sm">
                  {format(new Date(c.startDate), "dd/MM/yyyy")}
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(c.id)}>
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

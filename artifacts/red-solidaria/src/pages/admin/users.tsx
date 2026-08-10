import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { Plus, Edit2, Trash2, Check, Shield, ShieldCheck, UserCog, Eye, EyeOff } from "lucide-react";

interface AdminUser {
  id: number; username: string; role: string; name: string;
  email: string | null; active: boolean; createdAt: string;
}

const ROLES = [
  { value: "superadmin", label: "Superadmin", desc: "Acceso total al sistema y gestión de usuarios", icon: ShieldCheck, color: "text-purple-600" },
  { value: "administrador", label: "Administrador", desc: "Gestión de campañas, donaciones, contenido y adopciones", icon: Shield, color: "text-blue-600" },
  { value: "moderador", label: "Moderador", desc: "Ver y gestionar reportes, voluntarios y mensajes", icon: UserCog, color: "text-green-600" },
];

const ROLE_COLORS: Record<string, string> = {
  superadmin: "bg-purple-100 text-purple-800",
  administrador: "bg-blue-100 text-blue-800",
  moderador: "bg-green-100 text-green-800",
};

const userSchema = z.object({
  username: z.string().min(3, "Mínimo 3 caracteres"),
  password: z.string().min(6, "Mínimo 6 caracteres"),
  name: z.string().min(2, "Nombre requerido"),
  email: z.string().email("Email inválido").optional().or(z.literal("")),
  role: z.string().min(1),
  active: z.boolean().default(true),
});

const editUserSchema = z.object({
  name: z.string().min(2),
  email: z.string().email("Email inválido").optional().or(z.literal("")),
  role: z.string().min(1),
  password: z.string().optional(),
  active: z.boolean().default(true),
});

type CreateFormValues = z.infer<typeof userSchema>;
type EditFormValues = z.infer<typeof editUserSchema>;

function CreateUserForm({ onSave, onCancel }: { onSave: () => void; onCancel: () => void }) {
  const { toast } = useToast();
  const [showPass, setShowPass] = useState(false);
  const form = useForm<CreateFormValues>({
    resolver: zodResolver(userSchema),
    defaultValues: { username: "", password: "", name: "", email: "", role: "moderador", active: true },
  });

  const save = useMutation({
    mutationFn: async (values: CreateFormValues) => {
      const res = await fetch("/api/admin/users", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || "Error"); }
    },
    onSuccess: () => { toast({ title: "Usuario creado exitosamente" }); onSave(); },
    onError: (e: any) => toast({ title: e.message || "Error al crear usuario", variant: "destructive" }),
  });

  return (
    <div className="bg-card border border-border rounded-2xl p-5">
      <h3 className="font-bold mb-4">Nuevo usuario admin</h3>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(v => save.mutate(v))} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <FormField control={form.control} name="name" render={({ field }) => (
              <FormItem><FormLabel>Nombre completo *</FormLabel><FormControl><Input className="rounded-xl bg-secondary/30" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="username" render={({ field }) => (
              <FormItem><FormLabel>Usuario (login) *</FormLabel><FormControl><Input className="rounded-xl bg-secondary/30" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="email" render={({ field }) => (
              <FormItem><FormLabel>Email</FormLabel><FormControl><Input type="email" className="rounded-xl bg-secondary/30" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="password" render={({ field }) => (
              <FormItem><FormLabel>Contraseña *</FormLabel>
                <div className="relative">
                  <FormControl><Input type={showPass ? "text" : "password"} className="rounded-xl bg-secondary/30 pr-10" {...field} /></FormControl>
                  <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <FormMessage /></FormItem>
            )} />
          </div>
          <FormField control={form.control} name="role" render={({ field }) => (
            <FormItem><FormLabel>Rol *</FormLabel>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {ROLES.map(r => (
                  <button key={r.value} type="button" onClick={() => field.onChange(r.value)}
                    className={`p-3 rounded-xl border-2 text-left transition-all ${field.value === r.value ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"}`}>
                    <div className="flex items-center gap-2 mb-1"><r.icon className={`w-4 h-4 ${r.color}`} /><span className="font-semibold text-sm">{r.label}</span></div>
                    <p className="text-xs text-muted-foreground">{r.desc}</p>
                  </button>
                ))}
              </div>
              <FormMessage />
            </FormItem>
          )} />
          <div className="flex gap-3">
            <Button type="submit" disabled={save.isPending} className="rounded-xl"><Check className="w-4 h-4 mr-1" />{save.isPending ? "Creando..." : "Crear usuario"}</Button>
            <Button type="button" variant="outline" className="rounded-xl" onClick={onCancel}>Cancelar</Button>
          </div>
        </form>
      </Form>
    </div>
  );
}

function EditUserForm({ user, onSave, onCancel }: { user: AdminUser; onSave: () => void; onCancel: () => void }) {
  const { toast } = useToast();
  const form = useForm<EditFormValues>({
    resolver: zodResolver(editUserSchema),
    defaultValues: { name: user.name, email: user.email || "", role: user.role, password: "", active: user.active },
  });

  const save = useMutation({
    mutationFn: async (values: EditFormValues) => {
      const body = values.password ? values : { name: values.name, email: values.email, role: values.role, active: values.active };
      const res = await fetch(`/api/admin/users/${user.id}`, { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error("Error");
    },
    onSuccess: () => { toast({ title: "Usuario actualizado" }); onSave(); },
    onError: () => toast({ title: "Error al actualizar", variant: "destructive" }),
  });

  return (
    <div className="bg-card border border-border rounded-2xl p-5">
      <h3 className="font-bold mb-4">Editar {user.name}</h3>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(v => save.mutate(v))} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <FormField control={form.control} name="name" render={({ field }) => (
              <FormItem><FormLabel>Nombre</FormLabel><FormControl><Input className="rounded-xl bg-secondary/30" {...field} /></FormControl></FormItem>
            )} />
            <FormField control={form.control} name="email" render={({ field }) => (
              <FormItem><FormLabel>Email</FormLabel><FormControl><Input type="email" className="rounded-xl bg-secondary/30" {...field} /></FormControl></FormItem>
            )} />
            <FormField control={form.control} name="password" render={({ field }) => (
              <FormItem><FormLabel>Nueva contraseña (dejar vacío para no cambiar)</FormLabel><FormControl><Input type="password" placeholder="••••••" className="rounded-xl bg-secondary/30" {...field} /></FormControl></FormItem>
            )} />
            <FormField control={form.control} name="role" render={({ field }) => (
              <FormItem><FormLabel>Rol</FormLabel>
                <select {...field} className="w-full h-10 px-3 rounded-xl border border-input bg-secondary/30 text-sm">
                  {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </FormItem>
            )} />
          </div>
          <div className="flex items-center justify-between bg-secondary/40 rounded-xl p-3">
            <p className="text-sm font-medium">Usuario activo</p>
            <button type="button" role="switch" aria-checked={form.watch("active")} onClick={() => form.setValue("active", !form.watch("active"))}
              className={`relative w-10 h-5 rounded-full transition-colors ${form.watch("active") ? "bg-primary" : "bg-border"}`}>
              <span className={`absolute top-0.5 w-4 h-4 bg-card rounded-full shadow transition-transform ${form.watch("active") ? "translate-x-5" : "translate-x-0.5"}`} />
            </button>
          </div>
          <div className="flex gap-3">
            <Button type="submit" disabled={save.isPending} className="rounded-xl"><Check className="w-4 h-4 mr-1" />{save.isPending ? "Guardando..." : "Guardar"}</Button>
            <Button type="button" variant="outline" className="rounded-xl" onClick={onCancel}>Cancelar</Button>
          </div>
        </form>
      </Form>
    </div>
  );
}

export default function AdminUsers() {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: users = [], isLoading, error } = useQuery<AdminUser[]>({
    queryKey: ["/api/admin/users"],
    queryFn: async () => {
      const res = await fetch("/api/admin/users", { credentials: "include" });
      if (!res.ok) throw new Error("Sin permiso");
      return res.json();
    },
  });

  const deleteUser = useMutation({
    mutationFn: async (id: number) => { await fetch(`/api/admin/users/${id}`, { method: "DELETE", credentials: "include" }); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] }); toast({ title: "Usuario eliminado" }); },
  });

  const handleSave = () => { queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] }); setShowForm(false); setEditing(null); };

  if (error) {
    return (
      <div className="p-8 max-w-lg">
        <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center">
          <ShieldCheck className="w-12 h-12 mx-auto mb-3 text-red-400" />
          <h3 className="font-bold text-lg mb-2">Acceso restringido</h3>
          <p className="text-muted-foreground text-sm">Solo el Superadmin puede gestionar usuarios del sistema.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 sm:p-8 max-w-4xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-display font-black">Usuarios Admin</h1>
          <p className="text-muted-foreground mt-1">Gestión de roles y accesos internos del equipo</p>
        </div>
        <Button onClick={() => { setShowForm(true); setEditing(null); }} className="rounded-xl gap-2">
          <Plus className="w-4 h-4" /> Nuevo usuario
        </Button>
      </div>

      {/* Roles legend */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        {ROLES.map(r => (
          <div key={r.value} className="bg-secondary/30 rounded-xl p-4 flex gap-3 items-start">
            <r.icon className={`w-5 h-5 ${r.color} shrink-0 mt-0.5`} />
            <div>
              <h3 className="font-bold text-sm">{r.label}</h3>
              <p className="text-xs text-muted-foreground">{r.desc}</p>
            </div>
          </div>
        ))}
      </div>

      {(showForm && !editing) && (
        <div className="mb-6"><CreateUserForm onSave={handleSave} onCancel={() => setShowForm(false)} /></div>
      )}

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-5 text-sm text-amber-800">
        <strong>Nota:</strong> El usuario <strong>admin</strong> (env var) siempre tiene acceso como Superadmin y no aparece en esta lista. Los usuarios de la tabla pueden tener distintos roles y contraseñas.
      </div>

      {isLoading ? (
        <div className="space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="bg-card border border-border rounded-2xl h-20 animate-pulse" />)}</div>
      ) : users.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground bg-secondary/20 rounded-2xl">
          <UserCog className="w-12 h-12 mx-auto mb-3 opacity-20" />
          <p className="font-medium">No hay usuarios adicionales creados.</p>
          <p className="text-sm mt-1">El acceso actual es solo con las credenciales del sistema.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {users.map(u => (
            <div key={u.id}>
              {editing?.id === u.id ? (
                <EditUserForm user={u} onSave={handleSave} onCancel={() => setEditing(null)} />
              ) : (
                <div className={`bg-card border rounded-2xl p-4 flex items-center gap-4 ${!u.active ? "opacity-60 border-dashed" : "border-border"}`}>
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary shrink-0">
                    {u.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-bold">{u.name}</p>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${ROLE_COLORS[u.role] || "bg-secondary"}`}>{ROLES.find(r => r.value === u.role)?.label || u.role}</span>
                      {!u.active && <span className="text-xs text-muted-foreground">(Inactivo)</span>}
                    </div>
                    <p className="text-sm text-muted-foreground">@{u.username}{u.email ? ` • ${u.email}` : ""}</p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button size="sm" variant="outline" className="rounded-lg h-8 w-8 p-0" onClick={() => setEditing(u)} aria-label={`Editar ${u.name}`}>
                      <Edit2 className="w-3.5 h-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" className="rounded-lg h-8 w-8 p-0 text-destructive hover:bg-destructive/10"
                      onClick={() => { if (confirm(`¿Eliminar usuario "${u.name}"?`)) deleteUser.mutate(u.id); }} aria-label={`Eliminar ${u.name}`}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

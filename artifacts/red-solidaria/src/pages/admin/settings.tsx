import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Save, Settings, Phone, Share2, DollarSign, Loader2, ShieldCheck, Smartphone } from "lucide-react";

interface SettingRow {
  id: number;
  key: string;
  value: string | null;
  label: string | null;
  group: string | null;
}

const GROUP_ICONS: Record<string, React.ReactNode> = {
  general: <Settings className="w-4 h-4" />,
  contacto: <Phone className="w-4 h-4" />,
  redes: <Share2 className="w-4 h-4" />,
  donaciones: <DollarSign className="w-4 h-4" />,
};

const GROUP_LABELS: Record<string, string> = {
  general: "Información General",
  contacto: "Datos de Contacto",
  redes: "Redes Sociales",
  donaciones: "Métodos de Donación",
};

// Gestión de 2FA (TOTP) para la cuenta del usuario logueado: setup, activación
// con código, y desactivación. El secreto solo se muestra una vez (al configurar).
function TwoFactorCard() {
  const { toast } = useToast();
  const [setup, setSetup] = useState<{ secret: string; otpauthUri: string } | null>(null);
  const [code, setCode] = useState("");

  const status = useQuery({
    queryKey: ["2fa-status"],
    queryFn: async () => {
      const res = await fetch("/api/admin/2fa/status", { credentials: "include" });
      if (!res.ok) throw new Error("Error al consultar 2FA");
      return res.json() as Promise<{ enabled: boolean }>;
    },
  });

  const startSetup = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/2fa/setup", { method: "POST", credentials: "include" });
      if (!res.ok) {
        const e = await res.json().catch(() => null);
        throw new Error((e as { message?: string } | null)?.message || "Error al configurar 2FA");
      }
      return res.json() as Promise<{ secret: string; otpauthUri: string }>;
    },
    onSuccess: (data) => { setSetup(data); setCode(""); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const verify = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/2fa/verify", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      if (!res.ok) throw new Error("Código incorrecto");
    },
    onSuccess: () => {
      toast({ title: "2FA activado", description: "En el próximo login se pedirá el código." });
      setSetup(null);
      setCode("");
      status.refetch();
    },
    onError: () => toast({ title: "Código incorrecto", variant: "destructive" }),
  });

  const disable = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/2fa/disable", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      if (!res.ok) throw new Error("Código incorrecto");
    },
    onSuccess: () => { toast({ title: "2FA desactivado" }); setCode(""); status.refetch(); },
    onError: () => toast({ title: "Código incorrecto", variant: "destructive" }),
  });

  const enabled = status.data?.enabled ?? false;

  return (
    <div className="bg-card rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 px-6 py-4 border-b border-gray-50 bg-gray-50/50">
        <span className="text-primary"><ShieldCheck className="w-4 h-4" /></span>
        <h2 className="font-semibold text-gray-800">Seguridad de mi cuenta (2FA)</h2>
      </div>
      <div className="p-6 space-y-4">
        {enabled ? (
          <>
            <div className="flex items-center gap-2 text-sm">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100 text-green-800 text-xs font-semibold">
                <ShieldCheck className="w-3.5 h-3.5" /> 2FA activo
              </span>
              <span className="text-muted-foreground">Verificación en dos pasos habilitada para tu usuario.</span>
            </div>
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <Label htmlFor="2fa-disable-code">Código actual</Label>
                <Input
                  id="2fa-disable-code"
                  className="mt-1"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="••••••"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                />
              </div>
              <Button variant="outline" className="rounded-xl" onClick={() => disable.mutate()} disabled={code.length !== 6 || disable.isPending}>
                Desactivar 2FA
              </Button>
            </div>
          </>
        ) : setup ? (
          <>
            <p className="text-sm text-muted-foreground">
              Escanea el código con Google Authenticator (o Authy), o ingresa el secreto manualmente. Luego escribe el
              código de 6 dígitos para activarlo.
            </p>
            <div className="bg-secondary/40 rounded-xl p-4 space-y-2 font-mono text-sm break-all">
              <p className="font-sans text-xs font-semibold text-muted-foreground uppercase">URI otpauth</p>
              <p>{setup.otpauthUri}</p>
              <p className="font-sans text-xs font-semibold text-muted-foreground uppercase pt-2">Secreto</p>
              <p>{setup.secret}</p>
            </div>
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <Label htmlFor="2fa-verify-code">Código de verificación</Label>
                <Input
                  id="2fa-verify-code"
                  className="mt-1"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="••••••"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                />
              </div>
              <Button className="rounded-xl" onClick={() => verify.mutate()} disabled={code.length !== 6 || verify.isPending}>
                <Smartphone className="w-4 h-4 mr-1" /> Activar 2FA
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Añade una capa extra de seguridad a tu cuenta. Necesitarás una aplicación autenticadora (Google
              Authenticator, Authy, etc.).
            </p>
            <Button className="rounded-xl" onClick={() => startSetup.mutate()} disabled={startSetup.isPending}>
              {startSetup.isPending ? "Generando..." : "Configurar 2FA"}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

export default function AdminSettings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);

  const { data: settings = [], isLoading } = useQuery<SettingRow[]>({
    queryKey: ["admin-settings"],
    queryFn: async () => {
      const res = await fetch("/api/admin/settings", { credentials: "include" });
      if (!res.ok) throw new Error("Error al cargar configuración");
      const rows: SettingRow[] = await res.json();
      const initial: Record<string, string> = {};
      for (const r of rows) initial[r.key] = r.value ?? "";
      setForm(initial);
      return rows;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (data: Record<string, string>) => {
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Error al guardar");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Configuración guardada", description: "Los cambios se aplicaron correctamente." });
      queryClient.invalidateQueries({ queryKey: ["admin-settings"] });
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      setDirty(false);
    },
    onError: () => {
      toast({ title: "Error al guardar", variant: "destructive" });
    },
  });

  const handleChange = (key: string, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  const handleSave = () => saveMutation.mutate(form);

  const byGroup = settings.reduce<Record<string, SettingRow[]>>((acc, row) => {
    const g = row.group ?? "general";
    if (!acc[g]) acc[g] = [];
    acc[g].push(row);
    return acc;
  }, {});

  const groupOrder = ["general", "contacto", "redes", "donaciones"];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Configuración del Sitio</h1>
          <p className="text-sm text-muted-foreground mt-1">Datos generales de la organización usados en toda la web</p>
        </div>
        <Button
          onClick={handleSave}
          disabled={!dirty || saveMutation.isPending}
          className="gap-2"
        >
          {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Guardar cambios
        </Button>
      </div>

      {groupOrder.map((group) => {
        const rows = byGroup[group];
        if (!rows || rows.length === 0) return null;
        return (
          <div key={group} className="bg-card rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="flex items-center gap-2 px-6 py-4 border-b border-gray-50 bg-gray-50/50">
              <span className="text-primary">{GROUP_ICONS[group] ?? <Settings className="w-4 h-4" />}</span>
              <h2 className="font-semibold text-gray-800">{GROUP_LABELS[group] ?? group}</h2>
            </div>
            <div className="p-6 space-y-4">
              {rows.map((row) => {
                const isLong = row.key === "org_description";
                return (
                  <div key={row.key} className="space-y-1.5">
                    <Label htmlFor={row.key} className="text-sm font-medium text-gray-700">
                      {row.label ?? row.key}
                    </Label>
                    {isLong ? (
                      <Textarea
                        id={row.key}
                        value={form[row.key] ?? ""}
                        onChange={(e) => handleChange(row.key, e.target.value)}
                        rows={3}
                        className="resize-none"
                        placeholder={row.label ?? row.key}
                      />
                    ) : (
                      <Input
                        id={row.key}
                        value={form[row.key] ?? ""}
                        onChange={(e) => handleChange(row.key, e.target.value)}
                        placeholder={row.label ?? row.key}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {dirty && (
        <div className="fixed bottom-6 right-6 z-50">
          <Button
            onClick={handleSave}
            disabled={saveMutation.isPending}
            size="lg"
            className="shadow-xl gap-2 rounded-xl"
          >
            {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Guardar cambios
          </Button>
        </div>
      )}

      <TwoFactorCard />
    </div>
  );
}

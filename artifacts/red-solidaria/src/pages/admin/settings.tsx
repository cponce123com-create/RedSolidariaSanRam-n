import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Save, Settings, Phone, Share2, DollarSign, Loader2 } from "lucide-react";

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
          <div key={group} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
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
    </div>
  );
}

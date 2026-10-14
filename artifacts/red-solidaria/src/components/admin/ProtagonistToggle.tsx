import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { PROTAGONIST_SETTING_KEY, parseProtagonistId } from "@/lib/chocofest";

/**
 * Fija o quita la campaña protagonista de la portada pública.
 *
 * Usa un identificador ESTABLE (el id de la campaña) guardado en `settings`,
 * de modo que renombrar la campaña no rompe el protagonismo. Al ser una única
 * clave, solo puede haber una campaña protagonista a la vez.
 */
export function ProtagonistToggle({ campaignId }: { campaignId: number }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: settings } = useQuery<Record<string, string>>({
    queryKey: ["settings"],
    queryFn: async () => {
      const res = await fetch("/api/settings");
      if (!res.ok) throw new Error("settings");
      return (await res.json()) as Record<string, string>;
    },
    staleTime: 60 * 1000,
  });

  const currentId = parseProtagonistId(settings?.[PROTAGONIST_SETTING_KEY]);
  const isProtagonist = currentId === campaignId;

  const setProtagonist = async (nextId: number | null) => {
    try {
      const res = await fetch("/api/admin/protagonist-campaign", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ campaignId: nextId }),
      });
      if (!res.ok) throw new Error("request_failed");
      await queryClient.invalidateQueries({ queryKey: ["settings"] });
      // La portada pública reordena y excluye campañas según el protagonista:
      // se invalidan también las consultas de campañas para sincronizarla.
      await queryClient.invalidateQueries({
        predicate: (q) =>
          Array.isArray(q.queryKey) && q.queryKey[0] === "/api/campaigns",
      });
      toast({ title: t("adminCampaigns.protagonistUpdated") });
    } catch {
      toast({ title: t("adminCampaigns.protagonistError"), variant: "destructive" });
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      className={
        "h-8 rounded-lg text-xs font-medium " +
        (isProtagonist ? "border-amber-400 text-amber-600 hover:bg-amber-50" : "")
      }
      aria-pressed={isProtagonist}
      onClick={() => void setProtagonist(isProtagonist ? null : campaignId)}
    >
      {isProtagonist
        ? t("adminCampaigns.protagonistRemove")
        : t("adminCampaigns.protagonistSet")}
    </Button>
  );
}

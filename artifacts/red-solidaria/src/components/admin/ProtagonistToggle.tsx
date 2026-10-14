import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { PROTAGONIST_SETTING_KEY, parseProtagonistId } from "@/lib/chocofest";
import { usePublicSettings } from "@/hooks/use-public-settings";
import { errorMessage, invalidateCampaignQueries, setProtagonistCampaign } from "@/lib/campaign-admin";

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
  const { data: settings } = usePublicSettings();

  const currentId = parseProtagonistId(settings?.[PROTAGONIST_SETTING_KEY]);
  const isProtagonist = currentId === campaignId;

  const setProtagonist = async (nextId: number | null) => {
    try {
      await setProtagonistCampaign(nextId);
      // Invalida settings y campañas: la portada pública se reordena sin recargar.
      invalidateCampaignQueries(queryClient);
      toast({ title: t("adminCampaigns.protagonistUpdated") });
    } catch (err) {
      toast({
        title: errorMessage(err, t("adminCampaigns.protagonistError")),
        variant: "destructive",
      });
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

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  deleteCampaignDraft,
  errorMessage,
  invalidateCampaignQueries,
  setCampaignStatus,
  type CampaignStatus,
} from "@/lib/campaign-admin";

/**
 * Mutaciones del ciclo de vida de campañas.
 *
 * Centraliza dos cosas que antes faltaban y causaban fallos silenciosos:
 *  1. Mensaje de error REAL (p. ej. el 409 del backend al borrar) en un toast.
 *  2. Invalidación de TODAS las consultas de campañas + settings, para que el
 *     panel y el frontend público se actualicen sin recargar.
 */
export function useCampaignLifecycle() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: number; status: CampaignStatus }) =>
      setCampaignStatus(id, status),
    onSuccess: () => {
      invalidateCampaignQueries(queryClient);
      toast({ title: "Estado de la campaña actualizado" });
    },
    onError: (err) => {
      toast({
        title: "No se pudo cambiar el estado",
        description: errorMessage(err),
        variant: "destructive",
      });
    },
  });

  const remove = useMutation({
    mutationFn: (id: number) => deleteCampaignDraft(id),
    onSuccess: () => {
      invalidateCampaignQueries(queryClient);
      toast({ title: "Borrador eliminado" });
    },
    onError: (err) => {
      toast({
        title: "No se pudo eliminar la campaña",
        description: errorMessage(err),
        variant: "destructive",
      });
    },
  });

  return { setStatus, remove };
}

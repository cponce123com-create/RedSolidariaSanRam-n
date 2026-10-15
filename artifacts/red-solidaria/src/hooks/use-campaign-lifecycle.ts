import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  deleteCampaignDraft,
  errorMessage,
  fetchCampaignDeletionDiagnostic,
  fetchDemoPurgePreview,
  invalidateCampaignQueries,
  markCampaignDemo,
  purgeCampaignTestData,
  purgeDemoCampaign,
  saveSettings,
  setCampaignStatus,
  setProtagonistCampaign,
  unmarkCampaignDemo,
  type CampaignStatus,
  type DemoPurgeResult,
  type SettingEntry,
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

  /**
   * Purga de datos de prueba (Modalidad C). El servidor exige superadmin y
   * rechaza la operación (409) si hay contabilidad real: el mensaje REAL del
   * backend se muestra tal cual, sin genéricos.
   */
  const purgeTestData = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      purgeCampaignTestData(id, reason),
    onSuccess: () => {
      invalidateCampaignQueries(queryClient);
      toast({ title: "Datos de prueba purgados", description: "La operación quedó registrada en la auditoría." });
    },
    onError: (err) => {
      toast({
        title: "No se pudo purgar los datos de prueba",
        description: errorMessage(err),
        variant: "destructive",
      });
    },
  });

  return { setStatus, remove, purgeTestData };
}

/**
 * Diagnóstico de borrado de una campaña (Fase 1.2). Solo se consulta cuando hay
 * un `id` (el diálogo está abierto): evita peticiones innecesarias.
 */
export function useCampaignDeletionDiagnostic(id: number | null) {
  return useQuery({
    queryKey: ["campaign-deletion-diagnostic", id],
    queryFn: () => fetchCampaignDeletionDiagnostic(id as number),
    enabled: typeof id === "number" && id > 0,
    staleTime: 0,
  });
}

/**
 * Fija (o quita con `null`) la campaña protagonista de la portada. Invalida
 * campañas + settings: el primer bloque de la página de inicio cambia al
 * instante, sin recargar.
 */
export function useSetProtagonist() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (campaignId: number | null) => setProtagonistCampaign(campaignId),
    onSuccess: () => {
      invalidateCampaignQueries(queryClient);
      toast({ title: "Portada actualizada" });
    },
    onError: (err) => {
      toast({
        title: "No se pudo actualizar la portada",
        description: errorMessage(err),
        variant: "destructive",
      });
    },
  });
}

/** Guarda configuraciones (lugar, horario, lema…) del evento. */
export function useSaveSettings() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (entries: SettingEntry[]) => saveSettings(entries),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["settings"] });
      toast({ title: "Datos del evento guardados" });
    },
    onError: (err) => {
      toast({
        title: "No se pudieron guardar los datos",
        description: errorMessage(err),
        variant: "destructive",
      });
    },
  });
}

// ─── Purga definitiva de campañas DEMO (V7.2) ────────────────────────────────

/**
 * Análisis de seguridad de la purga DEMO. Solo se consulta con el diálogo
 * abierto y un `id` válido; nunca se cachea (`staleTime: 0`) porque el veredicto
 * depende del estado real de la base en este instante.
 */
export function useDemoPurgePreview(id: number | null) {
  return useQuery({
    queryKey: ["campaign-demo-purge-preview", id],
    queryFn: () => fetchDemoPurgePreview(id as number),
    enabled: typeof id === "number" && id > 0,
    staleTime: 0,
    retry: false,
  });
}

/**
 * Mutaciones de la purga DEMO. Los mensajes de error son los REALES del
 * servidor: un 409 explica exactamente qué dato impide destruir la campaña y un
 * 401 recuerda que la reautenticación es obligatoria.
 */
export function useDemoPurge() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  /** Declara la campaña como DEMO (paso previo, con reautenticación). */
  const mark = useMutation({
    mutationFn: ({ id, reason, password, totpCode }: {
      id: number;
      reason: string;
      password: string;
      totpCode?: string;
    }) => markCampaignDemo(id, { reason, password, totpCode }),
    onSuccess: () => {
      invalidateCampaignQueries(queryClient);
      void queryClient.invalidateQueries({ queryKey: ["campaign-demo-purge-preview"] });
      toast({
        title: "Campaña declarada como DEMO",
        description: "El análisis se ha recalculado con la nueva declaración.",
      });
    },
    onError: (err) => {
      toast({
        title: "No se pudo declarar la campaña como DEMO",
        description: errorMessage(err),
        variant: "destructive",
      });
    },
  });

  /** Retira la declaración DEMO (si se marcó por error). */
  const unmark = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason?: string }) =>
      unmarkCampaignDemo(id, reason),
    onSuccess: () => {
      invalidateCampaignQueries(queryClient);
      void queryClient.invalidateQueries({ queryKey: ["campaign-demo-purge-preview"] });
      toast({ title: "Declaración DEMO retirada" });
    },
    onError: (err) => {
      toast({
        title: "No se pudo retirar la declaración DEMO",
        description: errorMessage(err),
        variant: "destructive",
      });
    },
  });

  /** Purga irreversible: elimina la campaña DEMO y todos sus datos de prueba. */
  const purge = useMutation({
    mutationFn: ({ id, identifier, reason, password, totpCode }: {
      id: number;
      identifier: string;
      reason: string;
      password: string;
      totpCode?: string;
    }) => purgeDemoCampaign(id, { identifier, reason, password, totpCode }),
    onSuccess: (result: DemoPurgeResult) => {
      invalidateCampaignQueries(queryClient);
      void queryClient.invalidateQueries({ queryKey: ["campaign-demo-purge-preview"] });
      void queryClient.invalidateQueries({ queryKey: ["campaign-deletion-diagnostic"] });
      toast({
        title: "Campaña DEMO eliminada definitivamente",
        description: `Respaldo #${result.backupId} guardado (sello ${result.manifest.hash.slice(0, 12)}…). Operación registrada en la auditoría.`,
      });
    },
    onError: (err) => {
      toast({
        title: "No se pudo eliminar la campaña DEMO",
        description: errorMessage(err),
        variant: "destructive",
      });
    },
  });

  return { mark, unmark, purge };
}

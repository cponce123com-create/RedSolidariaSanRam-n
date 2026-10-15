import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { errorMessage } from "@/lib/api-error";
import {
  ANNULMENT_QUERY_KEY,
  DONORS_QUERY_KEY,
  DUPLICATES_QUERY_KEY,
  createDonor,
  fetchCampaignAnnulmentPreview,
  fetchDonor,
  fetchDonors,
  fetchDuplicateGroups,
  invalidateDonorQueries,
  reconcileDonation,
  updateDonor,
  voidCampaignDonations,
  voidDonation,
  type AnnulmentCredentials,
  type DonorInput,
} from "@/lib/donors-admin";
import type { CampaignVoidResult, DonationVoidResult } from "@/lib/donation-annulment";

/**
 * Hooks del panel de donantes. Centralizan:
 *  1. el mensaje de error REAL del backend en un toast, y
 *  2. la invalidación de donantes + duplicados + donaciones/campañas.
 */

export function useDonors() {
  return useQuery({
    queryKey: [DONORS_QUERY_KEY],
    queryFn: fetchDonors,
    staleTime: 30 * 1000,
  });
}

export function useDonor(id: number) {
  return useQuery({
    queryKey: [DONORS_QUERY_KEY, id],
    queryFn: () => fetchDonor(id),
    enabled: Number.isInteger(id) && id > 0,
    staleTime: 15 * 1000,
  });
}

export function useDuplicateGroups() {
  return useQuery({
    queryKey: [DUPLICATES_QUERY_KEY],
    queryFn: fetchDuplicateGroups,
    staleTime: 30 * 1000,
  });
}

export function useSaveDonor() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const create = useMutation({
    mutationFn: (input: DonorInput) => createDonor(input),
    onSuccess: () => {
      invalidateDonorQueries(queryClient);
      toast({ title: "Donante creado" });
    },
    onError: (err) => {
      toast({
        title: "No se pudo crear el donante",
        description: errorMessage(err),
        variant: "destructive",
      });
    },
  });

  const update = useMutation({
    mutationFn: ({ id, input }: { id: number; input: DonorInput }) =>
      updateDonor(id, input),
    onSuccess: () => {
      invalidateDonorQueries(queryClient);
      toast({ title: "Donante actualizado" });
    },
    onError: (err) => {
      toast({
        title: "No se pudo actualizar el donante",
        description: errorMessage(err),
        variant: "destructive",
      });
    },
  });

  return { create, update };
}

export function useReconcileDonation() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (id: number) => reconcileDonation(id),
    onSuccess: () => {
      invalidateDonorQueries(queryClient);
      toast({ title: "Donación conciliada" });
    },
    onError: (err) => {
      toast({
        title: "No se pudo conciliar la donación",
        description: errorMessage(err),
        variant: "destructive",
      });
    },
  });
}

// ─── Anulación contable de donaciones (V7.2.2) ───────────────────────────────

/**
 * Vista previa de la anulación en bloque de una campaña: qué donaciones se
 * anularían, por cuánto y cuáles no se pueden tocar. Solo se consulta con el
 * diálogo abierto; no se cachea porque el veredicto depende del estado real.
 */
export function useCampaignAnnulmentPreview(campaignId: number | null) {
  return useQuery({
    queryKey: [ANNULMENT_QUERY_KEY, campaignId, "donations-void-preview"],
    queryFn: () => fetchCampaignAnnulmentPreview(campaignId as number),
    enabled: typeof campaignId === "number" && campaignId > 0,
    staleTime: 0,
    retry: false,
  });
}

/**
 * Mutaciones de la anulación contable. Los mensajes de error son los REALES del
 * servidor: un 401 recuerda que la reautenticación es obligatoria y un 409
 * explica por qué esa donación no se puede anular.
 */
export function useDonationAnnulment() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  /** Anula UNA donación confirmada. */
  const voidOne = useMutation({
    mutationFn: ({ id, ...payload }: { id: number } & AnnulmentCredentials) =>
      voidDonation(id, payload),
    onSuccess: (result: DonationVoidResult) => {
      invalidateDonorQueries(queryClient);
      toast({
        title: "Donación anulada contablemente",
        description: result.reversal.appended
          ? `Se añadió el asiento compensatorio #${result.reversal.movementId ?? "—"}. La cadena sigue verificando.`
          : "No tenía asiento en el libro: solo cambió su estado.",
      });
    },
    onError: (err) => {
      toast({
        title: "No se pudo anular la donación",
        description: errorMessage(err),
        variant: "destructive",
      });
    },
  });

  /** Anula en bloque todas las donaciones confirmadas de una campaña. */
  const voidCampaign = useMutation({
    mutationFn: ({ campaignId, ...payload }: { campaignId: number } & AnnulmentCredentials) =>
      voidCampaignDonations(campaignId, payload),
    onSuccess: (result: CampaignVoidResult) => {
      invalidateDonorQueries(queryClient);
      void queryClient.invalidateQueries({ queryKey: [ANNULMENT_QUERY_KEY] });
      toast({
        title: `${result.annulled} donación(es) anulada(s)`,
        description: `Importe S/ ${result.totalAmount.toFixed(2)} · ${result.reversals} asiento(s) compensatorio(s). La cadena sigue verificando.`,
      });
    },
    onError: (err) => {
      toast({
        title: "No se pudieron anular las donaciones",
        description: errorMessage(err),
        variant: "destructive",
      });
    },
  });

  return { voidOne, voidCampaign };
}

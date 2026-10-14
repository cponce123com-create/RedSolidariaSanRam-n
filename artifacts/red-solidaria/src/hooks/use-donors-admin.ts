import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { errorMessage } from "@/lib/api-error";
import {
  DONORS_QUERY_KEY,
  DUPLICATES_QUERY_KEY,
  createDonor,
  fetchDonor,
  fetchDonors,
  fetchDuplicateGroups,
  invalidateDonorQueries,
  reconcileDonation,
  updateDonor,
  type DonorInput,
} from "@/lib/donors-admin";

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

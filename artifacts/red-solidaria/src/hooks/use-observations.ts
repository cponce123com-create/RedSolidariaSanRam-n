import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { errorMessage } from "@/lib/api-error";
import {
  OBSERVATIONS_QUERY_KEY,
  createObservation,
  fetchObservations,
  resolveObservation,
  type ObservationFilters,
  type ObservationInput,
} from "@/lib/observations-admin";

/** Observaciones de supervisión (privado). */
export function useObservations(filters: ObservationFilters) {
  return useQuery({
    queryKey: [OBSERVATIONS_QUERY_KEY, filters],
    queryFn: () => fetchObservations(filters),
    staleTime: 15 * 1000,
  });
}

export function useCreateObservation() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (input: ObservationInput) => createObservation(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [OBSERVATIONS_QUERY_KEY] });
      toast({ title: "Observación registrada" });
    },
    onError: (err) => {
      toast({
        title: "No se pudo registrar la observación",
        description: errorMessage(err),
        variant: "destructive",
      });
    },
  });
}

export function useResolveObservation() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (id: number) => resolveObservation(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [OBSERVATIONS_QUERY_KEY] });
      toast({ title: "Observación marcada como atendida" });
    },
    onError: (err) => {
      toast({
        title: "No se pudo resolver la observación",
        description: errorMessage(err),
        variant: "destructive",
      });
    },
  });
}

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { errorMessage } from "@/lib/api-error";
import {
  VOLUNTEERS_QUERY_KEY,
  fetchVolunteer,
  fetchVolunteers,
  updateVolunteerStatus,
  type VolunteerFilters,
} from "@/lib/volunteers-admin";

/** Postulaciones de voluntariado (privado). */
export function useVolunteers(filters: VolunteerFilters) {
  return useQuery({
    queryKey: [VOLUNTEERS_QUERY_KEY, filters],
    queryFn: () => fetchVolunteers(filters),
    staleTime: 15 * 1000,
  });
}

export function useVolunteer(id: number) {
  return useQuery({
    queryKey: [VOLUNTEERS_QUERY_KEY, "detail", id],
    queryFn: () => fetchVolunteer(id),
    enabled: Number.isInteger(id) && id > 0,
    staleTime: 10 * 1000,
  });
}

/**
 * Cambio de estado con el mensaje de error REAL del backend (por ejemplo, el
 * 409 con los estados permitidos cuando la transición no es válida).
 */
export function useUpdateVolunteerStatus() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: ({ id, status, adminNotes }: { id: number; status: string; adminNotes?: string }) =>
      updateVolunteerStatus(id, status, adminNotes),
    onSuccess: (updated) => {
      void queryClient.invalidateQueries({
        predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === VOLUNTEERS_QUERY_KEY,
      });
      toast({ title: `Postulación marcada como «${updated.statusLabel}»` });
    },
    onError: (err) => {
      toast({
        title: "No se pudo cambiar el estado",
        description: errorMessage(err),
        variant: "destructive",
      });
    },
  });
}

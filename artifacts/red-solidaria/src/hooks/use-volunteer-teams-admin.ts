import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { errorMessage } from "@/lib/api-error";
import {
  MEMBERSHIPS_QUERY_KEY,
  PARTICIPATIONS_QUERY_KEY,
  TEAMS_QUERY_KEY,
  assignTeam,
  createTeam,
  fetchMemberships,
  fetchParticipations,
  fetchTeams,
  leaveTeam,
  recordParticipation,
  updateTeam,
  type ParticipationInput,
  type TeamInput,
} from "@/lib/volunteer-teams-admin";

function invalidateVolunteerTeams(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: [TEAMS_QUERY_KEY] });
  void queryClient.invalidateQueries({
    predicate: (q) =>
      Array.isArray(q.queryKey) &&
      (q.queryKey[0] === MEMBERSHIPS_QUERY_KEY || q.queryKey[0] === PARTICIPATIONS_QUERY_KEY),
  });
}

export function useTeams() {
  return useQuery({
    queryKey: [TEAMS_QUERY_KEY],
    queryFn: fetchTeams,
    staleTime: 30 * 1000,
  });
}

export function useMemberships(volunteerId: number) {
  return useQuery({
    queryKey: [MEMBERSHIPS_QUERY_KEY, volunteerId],
    queryFn: () => fetchMemberships(volunteerId),
    enabled: Number.isInteger(volunteerId) && volunteerId > 0,
    staleTime: 15 * 1000,
  });
}

export function useParticipations(volunteerId: number) {
  return useQuery({
    queryKey: [PARTICIPATIONS_QUERY_KEY, volunteerId],
    queryFn: () => fetchParticipations(volunteerId),
    enabled: Number.isInteger(volunteerId) && volunteerId > 0,
    staleTime: 15 * 1000,
  });
}

export function useSaveTeam() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const create = useMutation({
    mutationFn: (input: TeamInput) => createTeam(input),
    onSuccess: () => {
      invalidateVolunteerTeams(queryClient);
      toast({ title: "Equipo creado" });
    },
    onError: (err) => {
      toast({
        title: "No se pudo crear el equipo",
        description: errorMessage(err),
        variant: "destructive",
      });
    },
  });

  const update = useMutation({
    mutationFn: ({ id, input }: { id: number; input: TeamInput }) => updateTeam(id, input),
    onSuccess: () => {
      invalidateVolunteerTeams(queryClient);
      toast({ title: "Equipo actualizado" });
    },
    onError: (err) => {
      toast({
        title: "No se pudo actualizar el equipo",
        description: errorMessage(err),
        variant: "destructive",
      });
    },
  });

  return { create, update };
}

export function useAssignTeam() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: ({
      volunteerId,
      teamId,
      role,
    }: {
      volunteerId: number;
      teamId: number;
      role?: string;
    }) => assignTeam(volunteerId, teamId, role),
    onSuccess: () => {
      invalidateVolunteerTeams(queryClient);
      toast({ title: "Voluntario asignado al equipo" });
    },
    onError: (err) => {
      toast({
        title: "No se pudo asignar el equipo",
        description: errorMessage(err),
        variant: "destructive",
      });
    },
  });
}

export function useLeaveTeam() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: ({ volunteerId, memberId }: { volunteerId: number; memberId: number }) =>
      leaveTeam(volunteerId, memberId),
    onSuccess: () => {
      invalidateVolunteerTeams(queryClient);
      toast({ title: "Pertenencia cerrada (el historial se conserva)" });
    },
    onError: (err) => {
      toast({
        title: "No se pudo cerrar la pertenencia",
        description: errorMessage(err),
        variant: "destructive",
      });
    },
  });
}

export function useRecordParticipation() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: ({
      volunteerId,
      input,
    }: {
      volunteerId: number;
      input: ParticipationInput;
    }) => recordParticipation(volunteerId, input),
    onSuccess: () => {
      invalidateVolunteerTeams(queryClient);
      toast({ title: "Participación registrada" });
    },
    onError: (err) => {
      toast({
        title: "No se pudo registrar la participación",
        description: errorMessage(err),
        variant: "destructive",
      });
    },
  });
}

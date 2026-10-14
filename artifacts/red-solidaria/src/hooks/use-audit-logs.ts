import { useQuery } from "@tanstack/react-query";
import {
  AUDIT_LOGS_QUERY_KEY,
  fetchAuditLogs,
  type AuditFilters,
} from "@/lib/audit-admin";

/** Registro de auditoría (solo lectura, privado). Filtra por acción/recurso/usuario. */
export function useAuditLogs(filters: AuditFilters) {
  return useQuery({
    queryKey: [AUDIT_LOGS_QUERY_KEY, filters],
    queryFn: () => fetchAuditLogs(filters),
    staleTime: 15 * 1000,
  });
}

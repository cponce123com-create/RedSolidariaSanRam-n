import { QueryClient } from "@tanstack/react-query";
import { publicRefreshInterval } from "./query-sync";

export function createAppQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        refetchOnWindowFocus: "always",
        refetchOnMount: "always",
        // Temporary failures must not permanently disable public synchronization.
        refetchInterval: query => publicRefreshInterval(query.queryKey),
      },
    },
  });
}

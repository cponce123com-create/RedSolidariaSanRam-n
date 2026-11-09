import type { QueryClient } from "@tanstack/react-query";
import { isEntityQueryKey, type QueryEntity } from "./query-keys";

const STORAGE_KEY = "red-solidaria:changed-entities";
const ENTITIES: readonly QueryEntity[] = ["campaigns", "donations", "allies", "settings", "pets", "news", "testimonials", "faq", "reports", "identity", "cms"];

// Only entity names travel between tabs, never records, credentials or tokens.
export function broadcastEntityChanges(entities: readonly QueryEntity[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ entities, nonce: `${Date.now()}-${Math.random()}` }));
  } catch { /* Storage may be disabled; focus and periodic revalidation still work. */ }
}

export function subscribeToEntityChanges(client: QueryClient): () => void {
  const receive = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY || !event.newValue) return;
    try {
      const message: unknown = JSON.parse(event.newValue);
      if (!message || typeof message !== "object" || !("entities" in message) || !Array.isArray(message.entities)) return;
      const entities = message.entities.filter((entity): entity is QueryEntity => ENTITIES.includes(entity));
      if (entities.length) void client.invalidateQueries({ predicate: query => isEntityQueryKey(query.queryKey, entities) });
    } catch { /* Ignore malformed messages from older clients. */ }
  };
  window.addEventListener("storage", receive);
  return () => window.removeEventListener("storage", receive);
}

export function publicRefreshInterval(key: readonly unknown[]): number | false {
  const head = key[0];
  if (typeof head !== "string" || head.startsWith("/api/admin/") || head.startsWith("admin-")) return false;
  if (isEntityQueryKey(key, ["pets"])) return 30_000;
  return isEntityQueryKey(key, ENTITIES) ? 120_000 : false;
}

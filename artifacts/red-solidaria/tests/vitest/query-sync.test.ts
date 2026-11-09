import { afterEach, describe, expect, it } from "vitest";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { waitFor } from "@testing-library/react";
import { invalidatePetQueries } from "@/lib/query-invalidation";
import { publicRefreshInterval, subscribeToEntityChanges } from "@/lib/query-sync";

describe("publication changes across tabs", () => {
  afterEach(() => localStorage.clear());
  it("refreshes a public pet list and invalidates its cached detail after an admin mutation in another tab", async () => {
    const admin = new QueryClient();
    const publicTab = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
    let available = true;
    const observer = new QueryObserver(publicTab, {
      queryKey: ["/api/pets", { species: "gato" }],
      queryFn: async () => available ? [{ id: 17, name: "Luna" }] : [],
    });
    const stopObserver = observer.subscribe(() => {});
    const stopSync = subscribeToEntityChanges(publicTab);
    publicTab.setQueryData(["/api/pets", "17"], { id: 17 });
    publicTab.setQueryData(["home-pets-available"], [{ id: 17 }]);
    publicTab.setQueryData(["/api/news"], [{ id: 1 }]);
    try {
      await waitFor(() => expect(observer.getCurrentResult().data).toHaveLength(1));
      available = false;
      invalidatePetQueries(admin);
      const key = "red-solidaria:changed-entities";
      window.dispatchEvent(new StorageEvent("storage", { key, newValue: localStorage.getItem(key) }));
      await waitFor(() => expect(observer.getCurrentResult().data).toEqual([]));
      expect(publicTab.getQueryState(["/api/pets", "17"])?.isInvalidated).toBe(true);
      expect(publicTab.getQueryState(["home-pets-available"])?.isInvalidated).toBe(true);
      expect(publicTab.getQueryState(["/api/news"])?.isInvalidated).toBe(false);
    } finally { stopSync(); stopObserver(); publicTab.clear(); admin.clear(); }
  });

  it("polls pet publication while visible without polling administrative or unrelated queries", () => {
    expect(publicRefreshInterval(["/api/pets", "17"])).toBe(30_000);
    expect(publicRefreshInterval(["home-pets-available"])).toBe(30_000);
    expect(publicRefreshInterval(["/api/news"])).toBe(120_000);
    expect(publicRefreshInterval(["/api/admin/pets"])).toBe(false);
    expect(publicRefreshInterval(["admin-settings"])).toBe(false);
    expect(publicRefreshInterval(["unrelated"])).toBe(false);
  });
});

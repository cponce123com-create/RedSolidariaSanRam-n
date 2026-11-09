import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { createAppQueryClient } from "@/lib/query-client";
import { AdoptionsSection } from "@/components/home/AdoptionsSection";
import { invalidatePetQueries } from "@/lib/query-invalidation";
import { renderWithProviders } from "./test-utils";

const pet = { id: 44, name: "Mochi", species: "gato", location: "San Ramón", status: "available", photos: ["https://example.org/mochi.jpg"] };

describe("home adoption wiring", () => {
  beforeEach(() => {
    vi.stubGlobal("IntersectionObserver", class {
      observe() {} unobserve() {} disconnect() {}
    });
  });
  it("removes a deleted pet from home after the same invalidation used by admin", async () => {
    let rows = [pet];
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(rows), { status: 200 })));
    const { queryClient } = renderWithProviders(<AdoptionsSection />);
    expect(await screen.findByRole("heading", { name: "Mochi" })).toBeInTheDocument();
    expect(screen.getByText("Gato")).toBeInTheDocument();
    rows = [];
    invalidatePetQueries(queryClient);
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Mochi" })).not.toBeInTheDocument());
    expect(screen.getByText("Aún no hay mascotas en adopción")).toBeInTheDocument();
  });

  it("hides stale cards on API failure, offers retry, and then reflects the empty list", async () => {
    let response = new Response(JSON.stringify([pet]), { status: 200 });
    vi.stubGlobal("fetch", vi.fn(async () => response.clone()));
    const { queryClient } = renderWithProviders(<AdoptionsSection />);
    await screen.findByRole("heading", { name: "Mochi" });
    response = new Response("{}", { status: 500 });
    invalidatePetQueries(queryClient);
    await screen.findByText("No pudimos actualizar las mascotas en adopción.");
    expect(screen.queryByRole("heading", { name: "Mochi" })).not.toBeInTheDocument();
    expect(screen.queryByText("Aún no hay mascotas en adopción")).not.toBeInTheDocument();
    response = new Response("[]", { status: 200 });
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    await screen.findByText("Aún no hay mascotas en adopción");
  });

  it("replaces a failed remote image with a local placeholder", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify([pet]), { status: 200 })));
    renderWithProviders(<AdoptionsSection />);
    const image = await screen.findByRole("img", { name: "Mochi" });
    fireEvent.error(image);
    expect(screen.getByRole("img", { name: "Mochi" }).tagName).toBe("DIV");
    expect(screen.getByRole("heading", { name: "Mochi" })).toBeInTheDocument();
  });

  it("recovers automatically after a transient API failure using the app query client", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const queryClient = createAppQueryClient();
    queryClient.setDefaultOptions({ queries: { ...queryClient.getDefaultOptions().queries, retry: false } });
    let status = 500;
    vi.stubGlobal("fetch", vi.fn(async () => new Response(status === 200 ? "[]" : "{}", { status })));
    const view = render(<QueryClientProvider client={queryClient}><AdoptionsSection /></QueryClientProvider>);
    try {
      await screen.findByText("No pudimos actualizar las mascotas en adopción.");
      status = 200;
      await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
      await screen.findByText("Aún no hay mascotas en adopción");
    } finally {
      view.unmount();
      queryClient.clear();
      vi.useRealTimers();
    }
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import PetDetail from "@/pages/pet-detail";
import { renderWithProviders } from "./test-utils";

describe("withdrawn pet detail", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("removes a previously loaded pet when revalidation reports it deleted or unpublished", async () => {
    let available = true;
    vi.stubGlobal("fetch", vi.fn(async () => available
      ? new Response(JSON.stringify({ id: 17, name: "Luna", species: "gato", photos: [], description: "Busca familia", healthStatus: "good", status: "available", location: "San Ramón", ageCategory: "adult", size: "small", createdAt: "2026-01-01" }), { status: 200 })
      : new Response(JSON.stringify({ error: "Mascota no encontrada" }), { status: 404 })));
    const { queryClient } = renderWithProviders(<PetDetail />, { path: "/adopciones/17", routePath: "/adopciones/:id" });
    expect(await screen.findByRole("heading", { name: "Luna" })).toBeInTheDocument();
    available = false;
    await queryClient.invalidateQueries({ queryKey: ["/api/pets"] });
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Luna" })).not.toBeInTheDocument());
    expect(screen.getByRole("link", { name: /adopciones/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /adoptar/i })).not.toBeInTheDocument();
  });
});

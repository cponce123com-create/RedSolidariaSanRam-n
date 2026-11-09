import { afterEach, expect, it, vi } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import AdminSettings from "@/pages/admin/settings";
import { renderWithProviders } from "./test-utils";
afterEach(() => vi.unstubAllGlobals());
it("preserves unsaved settings when the query refreshes", async () => {
  let value = "Original";
  vi.stubGlobal("fetch", vi.fn(async (url: string) => new Response(JSON.stringify(
    String(url).includes("2fa") ? { enabled: false } : [{ id: 1, key: "org_name", value, label: "Nombre", group: "general" }]
  ), { status: 200 })));
  const { queryClient } = renderWithProviders(<AdminSettings />);
  const input = await screen.findByLabelText("Nombre");
  fireEvent.change(input, { target: { value: "Borrador local" } });
  value = "Actualizado por otro administrador";
  await queryClient.invalidateQueries({ queryKey: ["admin-settings"] });
  await waitFor(() => expect(input).toHaveValue("Borrador local"));
});

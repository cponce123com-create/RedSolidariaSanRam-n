import { expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { FacebookConnectionCard } from "@/components/admin/FacebookConnectionCard";
import { renderWithProviders } from "./test-utils";

it("checks Facebook only on request and shows the verified Page and automatic publication setting", async () => {
  const request = vi.fn(async () => new Response(JSON.stringify({ status: "connected", pageIdConfigured: true,
    tokenConfigured: true, page: { id: "914513275073067", name: "Red Solidaria San Ramón" },
    message: "La identidad de la página está verificada.", publishingVerified: false, autoPublishEnabled: true, siteUrlConfigured: true }), { status: 200 }));
  vi.stubGlobal("fetch", request);
  renderWithProviders(<FacebookConnectionCard />);
  expect(request).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Comprobar conexión con Facebook" }));
  await screen.findByText("Red Solidaria San Ramón");
  expect(request).toHaveBeenCalledTimes(1);
  expect(request).toHaveBeenCalledWith("/api/admin/integrations/facebook/status", expect.objectContaining({ credentials: "include" }));
  expect(screen.getByText(/Publicación automática activada/)).toBeInTheDocument();
});

it("shows missing configuration without claiming a connection", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ status: "not_configured", pageIdConfigured: true,
    tokenConfigured: false, message: "Falta configurar el token de la página.", publishingVerified: false }), { status: 200 })));
  renderWithProviders(<FacebookConnectionCard />);
  fireEvent.click(screen.getByRole("button", { name: "Comprobar conexión con Facebook" }));
  await screen.findByText("Falta configurar el token de la página.");
  expect(screen.queryByText(/Página verificada:/)).not.toBeInTheDocument();
});

it("reports permission/session errors from the server", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ message: "No autenticado" }), { status: 401 })));
  renderWithProviders(<FacebookConnectionCard />);
  fireEvent.click(screen.getByRole("button", { name: "Comprobar conexión con Facebook" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("No autenticado");
});

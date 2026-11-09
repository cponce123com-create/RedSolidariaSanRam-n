import { expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { FacebookPublicationStatus } from "@/components/admin/FacebookPublicationStatus";
import { renderWithProviders } from "./test-utils";

function mockState(initial: string | null) {
  let status = initial;
  const request = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === "POST") status = "pending";
    return new Response(JSON.stringify({ publication: status ? { status, attempts: 1, lastError: null,
      postUrl: status === "published" ? "https://www.facebook.com/914513275073067_123" : null } : null,
      autoPublishEnabled: true }), { status: 200 });
  });
  vi.stubGlobal("fetch", request);
  return request;
}

it("shows published delivery and its link without a duplicate-send action", async () => {
  mockState("published");
  renderWithProviders(<FacebookPublicationStatus kind="news" sourceId={10} />);
  await screen.findByText("Publicado");
  expect(screen.getByRole("link", { name: "Ver publicación en Facebook" })).toHaveAttribute("href", "https://www.facebook.com/914513275073067_123");
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});

it("retries a rejected publication through the authenticated enqueue endpoint", async () => {
  const request = mockState("failed");
  renderWithProviders(<FacebookPublicationStatus kind="news" sourceId={10} />);
  fireEvent.click(await screen.findByRole("button", { name: "Reintentar envío a Facebook" }));
  await screen.findByText("Pendiente de envío");
  expect(request).toHaveBeenCalledWith("/api/admin/integrations/facebook/publications/news/10", expect.objectContaining({
    method: "POST", credentials: "include", body: JSON.stringify({ confirmNotPublished: false }),
  }));
});

it("requires explicit review before retrying a publication with an unknown result", async () => {
  const request = mockState("uncertain");
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  renderWithProviders(<FacebookPublicationStatus kind="campaign" sourceId={7} />);
  const button = await screen.findByRole("button", { name: "Revisar y reintentar" });
  fireEvent.click(button);
  expect(request.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(0);
  confirm.mockReturnValue(true);
  fireEvent.click(button);
  await waitFor(() => expect(request.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1));
  expect(request).toHaveBeenCalledWith("/api/admin/integrations/facebook/publications/campaign/7", expect.objectContaining({ body: JSON.stringify({ confirmNotPublished: true }) }));
});

it("does not offer to publish a draft campaign", async () => {
  mockState(null);
  renderWithProviders(<FacebookPublicationStatus kind="campaign" sourceId={7} publishable={false} />);
  await screen.findByText("Se enviará al activar la campaña.");
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});

it("shows the server-approved donation preview while preventing a read-only user from sending", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ publication: null, autoPublishEnabled: true,
    publishable: true, canRequest: false, preview: { title: "Nuevo aporte", summary: "Anónimo", imageUrl: null, link: "https://example.org/transparencia",
      message: "Confirmamos un aporte de S/ 50.00. Gracias a una persona solidaria." } }), { status: 200 })));
  renderWithProviders(<FacebookPublicationStatus kind="donation" sourceId={5} />);
  await screen.findByText("Vista previa de Facebook");
  expect(screen.getByText(/Confirmamos un aporte de S\/ 50.00/)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Enviar a Facebook" })).not.toBeInTheDocument();
});

it("the server eligibility check cannot be bypassed by the parent UI flag", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ publication: null, autoPublishEnabled: true,
    publishable: false, preview: null }), { status: 200 })));
  renderWithProviders(<FacebookPublicationStatus kind="donation" sourceId={5} publishable waitingText="Confirma el aporte antes de publicarlo." />);
  await screen.findByText("Confirma el aporte antes de publicarlo.");
  expect(screen.queryByRole("button", { name: "Enviar a Facebook" })).not.toBeInTheDocument();
});

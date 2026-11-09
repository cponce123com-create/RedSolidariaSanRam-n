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
  fireEvent.click(screen.getByRole("button", { name: "Ver estado de Facebook" }));
  await screen.findByText("Publicado");
  expect(screen.getByRole("link", { name: "Ver publicación en Facebook" })).toHaveAttribute("href", "https://www.facebook.com/914513275073067_123");
  expect(screen.queryByRole("button", { name: /Enviar a Facebook|Reintentar envío/ })).not.toBeInTheDocument();
});

it("retries a rejected publication through the authenticated enqueue endpoint", async () => {
  const request = mockState("failed");
  renderWithProviders(<FacebookPublicationStatus kind="news" sourceId={10} />);
  fireEvent.click(screen.getByRole("button", { name: "Ver estado de Facebook" }));
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
  fireEvent.click(screen.getByRole("button", { name: "Ver estado de Facebook" }));
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
  fireEvent.click(screen.getByRole("button", { name: "Ver estado de Facebook" }));
  await screen.findByText("Se enviará al activar la campaña.");
  expect(screen.queryByRole("button", { name: /Enviar a Facebook|Reintentar envío/ })).not.toBeInTheDocument();
});

it("shows the server-approved donation preview while preventing a read-only user from sending", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ publication: null, autoPublishEnabled: true,
    publishable: true, canRequest: false, preview: { title: "Nuevo aporte", summary: "Anónimo", imageUrl: null, link: "https://example.org/transparencia",
      message: "Confirmamos un aporte de S/ 50.00. Gracias a una persona solidaria." } }), { status: 200 })));
  renderWithProviders(<FacebookPublicationStatus kind="donation" sourceId={5} />);
  fireEvent.click(screen.getByRole("button", { name: "Ver estado de Facebook" }));
  await screen.findByText("Vista previa de Facebook");
  expect(screen.getByText(/Confirmamos un aporte de S\/ 50.00/)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Enviar a Facebook" })).not.toBeInTheDocument();
});

it("the server eligibility check cannot be bypassed by the parent UI flag", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ publication: null, autoPublishEnabled: true,
    publishable: false, preview: null }), { status: 200 })));
  renderWithProviders(<FacebookPublicationStatus kind="donation" sourceId={5} publishable waitingText="Confirma el aporte antes de publicarlo." />);
  fireEvent.click(screen.getByRole("button", { name: "Ver estado de Facebook" }));
  await screen.findByText("Confirma el aporte antes de publicarlo.");
  expect(screen.queryByRole("button", { name: "Enviar a Facebook" })).not.toBeInTheDocument();
});


it("a table with 100 contributions does not start 100 requests on mount", () => {
  const request = mockState(null);
  renderWithProviders(<>{Array.from({ length: 100 }, (_, i) => <FacebookPublicationStatus key={i} kind="donation" sourceId={i + 1} />)}</>);
  expect(screen.getAllByRole("button", { name: "Ver estado de Facebook" })).toHaveLength(100);
  expect(request).not.toHaveBeenCalled();
});

it("no-entry responses do not poll indefinitely", async () => {
  const request = mockState(null);
  renderWithProviders(<FacebookPublicationStatus kind="donation" sourceId={10} />);
  fireEvent.click(screen.getByRole("button", { name: "Ver estado de Facebook" }));
  await screen.findByText("Sin envío registrado");
  vi.useFakeTimers();
  try { await vi.advanceTimersByTimeAsync(180_000); expect(request).toHaveBeenCalledTimes(1); }
  finally { vi.useRealTimers(); }
});

it("a 429 is shown clearly and never causes automatic retries", async () => {
  const request = vi.fn(async () => new Response(JSON.stringify({ message: "Espera un minuto para consultar." }), { status: 429 }));
  vi.stubGlobal("fetch", request);
  renderWithProviders(<FacebookPublicationStatus kind="donation" sourceId={10} />);
  fireEvent.click(screen.getByRole("button", { name: "Ver estado de Facebook" }));
  await screen.findByText(/Espera un minuto para consultar/);
  vi.useFakeTimers();
  try { await vi.advanceTimersByTimeAsync(180_000); expect(request).toHaveBeenCalledTimes(1); }
  finally { vi.useRealTimers(); }
});

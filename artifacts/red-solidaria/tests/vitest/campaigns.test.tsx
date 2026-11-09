import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Campaigns from "@/pages/campaigns";
import { renderWithProviders } from "./test-utils";

const { getCampaigns } = vi.hoisted(() => ({ getCampaigns: vi.fn() }));
vi.mock("@workspace/api-client-react", () => ({ getCampaigns }));
vi.mock("@/components/home/ProtagonistCampaignSection", () => ({ useProtagonistId: () => null }));
vi.mock("@/components/shared/CmsPageHeading", () => ({ CmsPageHeading: () => <h1>Campañas</h1> }));
vi.mock("@/components/shared/CampaignCard", () => ({ CampaignCard: ({ campaign }: { campaign: { title: string } }) => <article>{campaign.title}</article> }));
vi.mock("@/components/shared/SEO", () => ({ default: () => null }));

describe("public campaigns", () => {
  beforeEach(() => getCampaigns.mockReset());

  it("distinguishes a server failure from an empty list and retries", async () => {
    getCampaigns.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce([]);
    renderWithProviders(<Campaigns />);
    expect(await screen.findByRole("alert")).toHaveTextContent("No pudimos cargar");
    expect(screen.queryByRole("navigation", { name: "Páginas de campañas" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Siguiente" })).toBeDisabled();
  });

  it("requests the next page and resets pagination when the filter changes", async () => {
    const rows = Array.from({ length: 24 }, (_, i) => ({ id: i + 1, title: `Campaña ${i}`, status: "completed" }));
    getCampaigns.mockResolvedValueOnce(rows).mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    renderWithProviders(<Campaigns />);
    expect(await screen.findByText("Campaña 0")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    await waitFor(() => expect(getCampaigns).toHaveBeenLastCalledWith(
      { status: undefined, limit: 24, offset: 24 }, expect.objectContaining({ signal: expect.any(AbortSignal) }),
    ));
    await userEvent.click(screen.getByRole("button", { name: "En Curso" }));
    await waitFor(() => expect(getCampaigns).toHaveBeenLastCalledWith(
      { status: "active", limit: 24, offset: 0 }, expect.objectContaining({ signal: expect.any(AbortSignal) }),
    ));
    expect(screen.getByText("Página 1")).toBeInTheDocument();
  });
});

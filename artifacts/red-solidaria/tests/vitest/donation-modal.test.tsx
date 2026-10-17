import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import { DonationModal } from "@/components/shared/DonationModal";
import { renderWithProviders } from "./test-utils";

vi.mock("@/hooks/use-public-settings", () => ({
  usePublicSettings: () => ({ data: { org_whatsapp: "51921615737" } }),
}));

describe("DonationModal", () => {
  it("envía a WhatsApp para coordinar y no ofrece un pago público", () => {
    renderWithProviders(
      <DonationModal open onClose={vi.fn()} campaignTitle="ChocoFest 2026" />,
    );

    expect(screen.getByRole("heading", { name: "Coordina tu aporte por WhatsApp" })).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /Escribir al WhatsApp/ });
    expect(link).toHaveAttribute("href", expect.stringContaining("wa.me/51921615737"));
    expect(decodeURIComponent(link.getAttribute("href") || "")).toContain("ChocoFest 2026");
    expect(screen.queryByRole("button", { name: /Confirmar donación/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/correo/i)).not.toBeInTheDocument();
  });
});

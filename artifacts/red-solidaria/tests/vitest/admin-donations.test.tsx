// Regresión del bug "montos en cero en /admin/donaciones": la API puede
// devolver amount como string numérico ("50.00") cuando el mapper del
// customType money no convierte (pg numeric → string). La página debe
// formatear Number("50.00") = 50 → "S/ 50", NUNCA "S/ 0".
import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import AdminDonations from "@/pages/admin/donations";
import { renderWithProviders } from "./test-utils";

const donationsMock = vi.hoisted(() => ({
  donations: [
    {
      id: 1,
      campaignId: 1,
      campaignTitle: "Chocolatada Navideña",
      firstName: "María",
      lastName: "Quispe",
      email: "maria@example.com",
      phone: null,
      amount: "50.00", // string: pg numeric sin mapper (caso del bug)
      paymentMethod: "yape",
      message: null,
      anonymous: false,
      publicProof: false,
      receiptUrl: null,
      receiptNote: null,
      status: "approved",
      adminNote: null,
      createdAt: "2026-08-06T22:12:12.841Z",
    },
  ],
  stats: {
    totalDonations: "11",
    totalAmount: "790.00", // string: sum() de pg
    pendingCount: "2",
    approvedCount: "9",
    totalDonors: "11",
  },
}));

vi.mock("@workspace/api-client-react", () => ({
  useGetDonations: () => ({ data: donationsMock.donations, isLoading: false }),
  useGetDonationStats: () => ({ data: donationsMock.stats }),
  useUpdateDonationStatus: () => ({ mutate: vi.fn() }),
}));

describe("AdminDonations", () => {
  it("formatea montos string de la API como números, no como ceros", () => {
    renderWithProviders(<AdminDonations />);

    // Stats: "790.00" → S/ 790 (Number + toLocaleString)
    expect(screen.getByText("S/ 790")).toBeInTheDocument();
    // Tabla: "50.00" → S/ 50
    expect(screen.getByText("S/ 50")).toBeInTheDocument();
    // Nunca muestra el monto crudo ni un cero inventado
    expect(screen.queryByText("S/ 50.00")).not.toBeInTheDocument();
    expect(screen.queryByText("S/ 0")).not.toBeInTheDocument();
  });
});

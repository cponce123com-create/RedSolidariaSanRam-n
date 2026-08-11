// Regresión del bug "montos en cero en /admin/donaciones": la API puede
// devolver amount como string numérico ("50.00") cuando el mapper del
// customType money no convierte (pg numeric → string). La página debe
// formatear Number("50.00") = 50 → "S/ 50", NUNCA "S/ 0".
// También cubre el guard anti-stale: una fila sin id numérico no dispara
// PUT /api/donations/undefined.
import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

const updateStatusMock = vi.hoisted(() => ({ mutate: vi.fn() }));

vi.mock("@workspace/api-client-react", () => ({
  useGetDonations: () => ({ data: donationsMock.donations, isLoading: false }),
  useGetDonationStats: () => ({ data: donationsMock.stats }),
  useUpdateDonationStatus: () => ({ mutate: updateStatusMock.mutate, isPending: false }),
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

  it("fila sin id numérico (datos stale de un redeploy) no dispara PUT /undefined", async () => {
    // Simula la sesión con datos de antes del redeploy: la fila no trae id.
    donationsMock.donations = [{
      ...donationsMock.donations[0],
      id: undefined as unknown as number,
      status: "pending",
    }];
    updateStatusMock.mutate.mockClear();

    renderWithProviders(<AdminDonations />);

    await screen.findByTestId("btn-approve-donation");
    const user = userEvent.setup();
    await user.click(screen.getByTestId("btn-approve-donation"));

    // Nunca llama a la mutation (evita el PUT /api/donations/undefined)
    expect(updateStatusMock.mutate).not.toHaveBeenCalled();
    // Avisa que los datos están desactualizados
    expect(screen.getByText("Datos desactualizados")).toBeInTheDocument();

    // Restaura para no contaminar otros tests
    donationsMock.donations = [{
      ...donationsMock.donations[0],
      id: 1,
      status: "approved",
    }];
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DonationModal } from "@/components/shared/DonationModal";
import { renderWithProviders } from "./test-utils";

// Mock del hook generado por orval: controlamos mutate() por test.
const { mutateMock } = vi.hoisted(() => ({ mutateMock: vi.fn() }));

vi.mock("@workspace/api-client-react", () => ({
  useCreateDonation: () => ({ mutate: mutateMock, isPending: false }),
}));

describe("DonationModal", () => {
  beforeEach(() => {
    mutateMock.mockReset();
    mutateMock.mockImplementation((_args: unknown, opts?: { onSuccess?: (res: { id: number }) => void }) => {
      opts?.onSuccess?.({ id: 7 });
    });
  });

  it("muestra el paso 1 y valida el monto mínimo", async () => {
    const user = userEvent.setup();
    renderWithProviders(<DonationModal open onClose={vi.fn()} />);

    expect(screen.getByText("Hacer una Donación General")).toBeInTheDocument();
    expect(screen.getByText("Paso 1: Monto y Método")).toBeInTheDocument();

    const amount = screen.getByTestId("donation-amount");
    await user.clear(amount);
    await user.type(amount, "1");
    await user.click(screen.getByRole("button", { name: /continuar/i }));

    expect(await screen.findByText("El monto mínimo es S/ 5")).toBeInTheDocument();
    // Sigue en el paso 1: aún no se ve el paso 2
    expect(screen.queryByText("Tus Datos y Comprobante")).not.toBeInTheDocument();
  });

  it("rechaza montos con más de 2 decimales (sin redondeo silencioso)", async () => {
    const user = userEvent.setup();
    renderWithProviders(<DonationModal open onClose={vi.fn()} />);

    const amount = screen.getByTestId("donation-amount");
    await user.clear(amount);
    await user.type(amount, "50.123");
    await user.click(screen.getByRole("button", { name: /continuar/i }));

    expect(await screen.findByText("El monto admite máximo 2 decimales")).toBeInTheDocument();
    expect(screen.queryByText("Tus Datos y Comprobante")).not.toBeInTheDocument();
  });

  it("flujo completo: paso 2 → confirmación → pantalla de éxito", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <DonationModal open onClose={vi.fn()} campaignId={3} campaignTitle="Campaña Test" />,
    );

    expect(screen.getByText("Donar a: Campaña Test")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /continuar/i }));
    expect(await screen.findByText("Paso 2: Tus Datos y Comprobante")).toBeInTheDocument();

    await user.type(screen.getByTestId("input-first-name"), "Ana");
    await user.type(screen.getByLabelText("Apellido"), "López");
    await user.type(screen.getByLabelText("Correo Electrónico"), "ana@test.com");

    await user.click(screen.getByTestId("btn-submit-donation"));

    expect(await screen.findByText("¡Gracias por tu donación!")).toBeInTheDocument();
    expect(screen.getByText("ID de Donación: #7")).toBeInTheDocument();
    expect(mutateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ campaignId: 3, firstName: "Ana", email: "ana@test.com" }),
      }),
      expect.any(Object),
    );
  });
});

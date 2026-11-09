import { it, expect, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { DonationVoidDialog } from "@/components/admin/DonationVoidDialog";
import { renderWithProviders } from "./test-utils";
const mutation = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/use-donors-admin", () => ({
  useDonationAnnulment: () => ({ voidOne: { mutate: mutation, isPending: false }, voidCampaign: { mutate: vi.fn(), isPending: false } }),
  useCampaignAnnulmentPreview: () => ({}),
}));
const donation = { id: 73, title: "Aporte de prueba", amount: 100, status: "reconciled" };
it("explains a disabled annulment button when the reason is too short", () => {
  renderWithProviders(<DonationVoidDialog donation={donation} open onOpenChange={vi.fn()} />);
  fireEvent.change(screen.getByLabelText("Motivo (obligatorio)"), { target: { value: "prueba123" } });
  fireEvent.change(screen.getByLabelText("Tu contraseña (reautenticación)"), { target: { value: "test-password" } });
  fireEvent.click(screen.getByRole("checkbox"));
  expect(screen.getByRole("button", { name: "Anular contablemente" })).toBeDisabled();
  expect(screen.getByRole("status")).toHaveTextContent("has escrito 9");
  expect(screen.getByText(/9\/10 caracteres mínimos/)).toBeInTheDocument();
});
it("a test-record reason enables a valid, explicit annulment without deleting or spoofing accounting status", () => {
  mutation.mockClear();
  renderWithProviders(<DonationVoidDialog donation={donation} open onOpenChange={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Usar motivo: aporte de prueba" }));
  fireEvent.change(screen.getByLabelText("Tu contraseña (reautenticación)"), { target: { value: "test-password" } });
  expect(screen.getByRole("button", { name: "Anular contablemente" })).toBeDisabled();
  fireEvent.click(screen.getByRole("checkbox"));
  const button = screen.getByRole("button", { name: "Anular contablemente" });
  expect(button).not.toBeDisabled(); fireEvent.click(button);
  expect(mutation).toHaveBeenCalledWith(expect.objectContaining({ id: 73, reason: expect.stringContaining("Aporte de prueba"), password: "test-password" }), expect.anything());
});

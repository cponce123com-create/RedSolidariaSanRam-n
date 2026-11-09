import { describe, it, expect, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ManualDonationForm } from "@/components/admin/ManualDonationForm";
import { renderWithProviders } from "./test-utils";
const uploadMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/cloudinary-upload", async original => ({ ...await original<typeof import("@/lib/cloudinary-upload")>(), uploadImageToCloudinary: uploadMock }));
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
function setup(fetcher: typeof fetch) {
  vi.stubGlobal("fetch", vi.fn(fetcher));
  const onSaved = vi.fn();
  renderWithProviders(<ManualDonationForm campaigns={[{ id: 2, title: "ChocoFest", status: "active" }]} onSaved={onSaved} onCancel={vi.fn()} />);
  return { user: userEvent.setup(), onSaved };
}
async function fill(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Nombres"), "Carlos");
  await user.type(screen.getByLabelText("Apellidos"), "Ponce");
  await user.type(screen.getByLabelText("Monto recibido (S/)"), "50");
}
describe("Registro de un nuevo aporte", () => {
  it("guarda comprobante y foto por separado con plantilla y autorización", async () => {
    let payload: Record<string, unknown> = {};
    const { user, onSaved } = setup(async (_input, init) => { payload = JSON.parse(String(init?.body)); return response({ id: 21 }, 201); });
    uploadMock.mockResolvedValueOnce({ imageUrl: "https://res.cloudinary.com/test/proof.jpg", publicId: "proof" }).mockResolvedValueOnce({ imageUrl: "https://res.cloudinary.com/test/photo.jpg", publicId: "photo" });
    await fill(user);
    await user.selectOptions(screen.getByLabelText("Campaña"), "2");
    await user.selectOptions(screen.getByLabelText("Plantilla de publicación"), "impacto");
    await user.upload(screen.getByLabelText("Comprobante privado (opcional al registrar)"), new File(["proof"], "proof.jpg", { type: "image/jpeg" }));
    await screen.findByAltText("Comprobante privado (opcional al registrar)");
    await user.upload(screen.getByLabelText("Foto pública para Facebook (opcional)"), new File(["photo"], "photo.jpg", { type: "image/jpeg" }));
    await screen.findByAltText("Foto pública para Facebook (opcional)");
    await user.click(screen.getByLabelText(/Cuento con autorización/));
    await user.click(screen.getByRole("button", { name: "Guardar como pendiente" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(21));
    expect(payload).toMatchObject({ amount: 50, campaignId: 2, anonymous: true, publicProof: false, publicPhotoConsent: true, proofPublicId: "proof", publicationImagePublicId: "photo", publicationTemplate: "impacto" });
    expect(payload.email).toMatch(/@sin-correo.redsolidaria.invalid$/);
    expect(payload).not.toHaveProperty("status");
  });
  it("previsualiza anónimo y limpia la vista previa al cambiar datos", async () => {
    let payload: Record<string, unknown> = {};
    const { user } = setup(async (_input, init) => { payload = JSON.parse(String(init?.body)); return response({ message: "Vista previa anónima", imageUrl: null, link: null }); });
    await fill(user);
    await user.click(screen.getByRole("button", { name: "Ver plantilla con estos datos" }));
    expect(await screen.findByText("Vista previa anónima")).toBeInTheDocument();
    expect(payload).toMatchObject({ recognitionName: null, publicationImageUrl: null });
    expect(payload).not.toHaveProperty("proofImageUrl");
    await user.type(screen.getByLabelText("Nombres"), " Eduardo");
    expect(screen.queryByTestId("donation-draft-preview")).not.toBeInTheDocument();
  });
  it("tras un corte reintenta exactamente el mismo registro sin duplicarlo", async () => {
    const payloads: unknown[] = [];
    const { user, onSaved } = setup(async (_input, init) => {
      payloads.push(JSON.parse(String(init?.body)));
      if (payloads.length === 1) throw new TypeError("Failed to fetch");
      return response({ id: 32 });
    });
    await fill(user);
    await user.click(screen.getByRole("button", { name: "Guardar como pendiente" }));
    await screen.findByRole("button", { name: "Reintentar el mismo registro" });
    expect(screen.getByLabelText("Nombres")).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Reintentar el mismo registro" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(32));
    expect(payloads[1]).toEqual(payloads[0]);
  });
  it("muestra validación y permite corregir datos", async () => {
    const { user } = setup(async () => response({ message: "WhatsApp inválido" }, 400));
    await fill(user);
    await user.click(screen.getByRole("button", { name: "Guardar como pendiente" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("WhatsApp inválido");
    expect(screen.getByLabelText("Nombres")).not.toBeDisabled();
  });
  it("los productos no se guardan como dinero", async () => {
    let payload: Record<string, unknown> = {};
    const { user, onSaved } = setup(async (_input, init) => { payload = JSON.parse(String(init?.body)); return response({ id: 33 }); });
    await fill(user);
    await user.selectOptions(screen.getByLabelText("Tipo de aporte"), "productos");
    await user.type(screen.getByLabelText("Valor estimado (S/, opcional)"), "200");
    await user.click(screen.getByRole("button", { name: "Guardar como pendiente" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(33));
    expect(payload.amount).toBe(0);
    expect(payload.items).toEqual([{ product: "panetones", quantity: 1, unit: "unidad", estimatedValue: 200 }]);
    expect(payload).not.toHaveProperty("paymentMethod");
  });
  it("logística guarda su descripción, no un producto inventado", async () => {
    let payload: Record<string, unknown> = {};
    const { user, onSaved } = setup(async (_input, init) => { payload = JSON.parse(String(init?.body)); return response({ id: 34 }); });
    await fill(user);
    await user.selectOptions(screen.getByLabelText("Tipo de aporte"), "logistica");
    await user.type(screen.getByLabelText("Describe el servicio o apoyo logístico"), "Transporte de alimentos a la campaña");
    await user.click(screen.getByRole("button", { name: "Guardar como pendiente" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(34));
    expect(payload).toMatchObject({ amount: 0, collaborationType: "logistica", message: "Transporte de alimentos a la campaña" });
    expect(payload).not.toHaveProperty("items");
  });
});

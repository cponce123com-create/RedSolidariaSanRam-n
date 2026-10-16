// Regresión del modal de donación que NO cerraba (V20 · Fase 1) + flujo de 2 pasos.
//
// Causa raíz cubierta aquí: `onOpenChange={open ? undefined : resetAndClose}` dejaba
// el diálogo SIN manejador cuando estaba abierto, así que la X, la tecla Escape y el
// clic fuera no hacían nada. Estos tests fijan que el cierre siempre funciona, que
// pide confirmación si hay datos escritos y que no se pierde el envío a medias.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { I18nextProvider } from "react-i18next";
import i18n from "@/lib/i18n";
import { DonationModal } from "@/components/shared/DonationModal";

// Polyfills que jsdom no trae y Radix necesita.
if (!("ResizeObserver" in globalThis)) {
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

// El error de negocio se define aquí para poder construir instancias reales: el
// componente solo muestra el mensaje del servidor cuando es de este tipo.
const mocks = vi.hoisted(() => {
  class DonationSubmitError extends Error {}
  return { submitDonation: vi.fn(), DonationSubmitError };
});

vi.mock("@/lib/donation-submit", () => ({
  submitDonation: mocks.submitDonation,
  DonationSubmitError: mocks.DonationSubmitError,
  newDedupeToken: () => "test-token-1234",
}));

vi.mock("canvas-confetti", () => ({ default: vi.fn() }));

function renderModal(onClose: () => void) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <DonationModal open onClose={onClose} campaignId={7} campaignTitle="ChocoFest 2026" />
      </I18nextProvider>
    </QueryClientProvider>,
  );
}

describe("DonationModal", () => {
  beforeEach(() => {
    mocks.submitDonation.mockReset();
  });

  it("abre y muestra el paso 1 con las tres opciones", () => {
    renderModal(vi.fn());
    expect(screen.getByTestId("donation-modal")).toBeInTheDocument();
    expect(screen.getByTestId("choice-dinero")).toBeInTheDocument();
    expect(screen.getByTestId("choice-productos")).toBeInTheDocument();
    expect(screen.getByTestId("choice-servicios")).toBeInTheDocument();
  });

  it("cierra con la X cuando no hay datos introducidos (causa raíz corregida)", async () => {
    const onClose = vi.fn();
    renderModal(onClose);
    const user = userEvent.setup();
    await user.click(screen.getByTestId("btn-donation-close"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("cierra con la tecla Escape", async () => {
    const onClose = vi.fn();
    renderModal(onClose);
    const user = userEvent.setup();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("cierra con el botón Cancelar", async () => {
    const onClose = vi.fn();
    renderModal(onClose);
    const user = userEvent.setup();
    await user.click(screen.getByTestId("btn-donation-cancel"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("pide confirmación antes de descartar datos escritos y permite seguir editando", async () => {
    const onClose = vi.fn();
    renderModal(onClose);
    const user = userEvent.setup();

    // Elegir «productos» ya cuenta como dato introducido.
    await user.click(screen.getByTestId("choice-productos"));
    await user.click(screen.getByTestId("btn-donation-close"));

    // NO se cierra: aparece la confirmación.
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByTestId("donation-discard-confirm")).toBeInTheDocument();

    // «Seguir editando» vuelve al formulario sin cerrar.
    await user.click(screen.getByTestId("btn-donation-keep-editing"));
    expect(screen.queryByTestId("donation-discard-confirm")).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();

    // Y «Descartar» sí cierra.
    await user.click(screen.getByTestId("btn-donation-close"));
    await user.click(screen.getByTestId("btn-donation-discard"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("envía una donación de productos y muestra el código de seguimiento", async () => {
    mocks.submitDonation.mockResolvedValue({
      id: 42,
      trackingCode: "RSR-2026-A7K3Q9",
      fulfillmentStatus: "pendiente_coordinacion",
      status: "pending",
      amount: 0,
      collaborationType: "productos",
    });
    const onClose = vi.fn();
    renderModal(onClose);
    const user = userEvent.setup();

    await user.click(screen.getByTestId("choice-productos"));
    await user.click(screen.getByTestId("btn-donation-next"));

    await user.type(screen.getByTestId("input-donor-name"), "María Quispe");
    await user.type(screen.getByTestId("input-donor-phone"), "921615737");
    await user.type(screen.getByTestId("input-donor-email"), "maria@example.com");
    await user.click(screen.getByTestId("btn-submit-donation"));

    await waitFor(() => expect(mocks.submitDonation).toHaveBeenCalledTimes(1));
    const payload = mocks.submitDonation.mock.calls[0][0];
    expect(payload.collaborationType).toBe("productos");
    expect(payload.amount).toBe(0);
    expect(payload.phone).toBe("+51921615737");
    expect(payload.contactConsent).toBe(true);
    expect(Array.isArray(payload.items)).toBe(true);
    expect(payload.items[0].product).toBe("panetones");
    expect(payload.dedupeToken).toBe("test-token-1234");

    expect(await screen.findByTestId("donation-tracking-code")).toHaveTextContent("RSR-2026-A7K3Q9");
  });

  it("no muestra éxito si la API falla", async () => {
    mocks.submitDonation.mockRejectedValue(
      new mocks.DonationSubmitError("El monto mínimo es S/ 5"),
    );
    renderModal(vi.fn());
    const user = userEvent.setup();

    await user.click(screen.getByTestId("btn-donation-next"));
    await user.type(screen.getByTestId("input-donor-name"), "María Quispe");
    await user.type(screen.getByTestId("input-donor-phone"), "921615737");
    await user.type(screen.getByTestId("input-donor-email"), "maria@example.com");
    await user.click(screen.getByTestId("btn-submit-donation"));

    expect(await screen.findByTestId("donation-error")).toHaveTextContent("El monto mínimo es S/ 5");
    expect(screen.queryByTestId("donation-tracking-code")).not.toBeInTheDocument();
  });

  it("valida el WhatsApp peruano antes de enviar", async () => {
    renderModal(vi.fn());
    const user = userEvent.setup();

    await user.click(screen.getByTestId("btn-donation-next"));
    await user.type(screen.getByTestId("input-donor-name"), "María Quispe");
    await user.type(screen.getByTestId("input-donor-phone"), "123");
    await user.type(screen.getByTestId("input-donor-email"), "maria@example.com");
    await user.click(screen.getByTestId("btn-submit-donation"));

    expect(await screen.findByText(/WhatsApp peruano válido/i)).toBeInTheDocument();
    expect(mocks.submitDonation).not.toHaveBeenCalled();
  });

  // ── Regresiones conservadas del test anterior del modal ────────────────────
  it("valida el monto mínimo (S/ 5) sin avanzar de paso", async () => {
    renderModal(vi.fn());
    const user = userEvent.setup();

    const amount = screen.getByTestId("donation-amount");
    await user.clear(amount);
    await user.type(amount, "1");
    await user.click(screen.getByTestId("btn-donation-next"));

    expect(await screen.findByText("El monto mínimo es S/ 5.")).toBeInTheDocument();
    // Sigue en el paso 1: no se ve el paso de datos.
    expect(screen.queryByTestId("input-donor-name")).not.toBeInTheDocument();
  });

  it("rechaza montos con más de 2 decimales (sin redondeo silencioso)", async () => {
    renderModal(vi.fn());
    const user = userEvent.setup();

    const amount = screen.getByTestId("donation-amount");
    await user.clear(amount);
    await user.type(amount, "50.123");
    await user.click(screen.getByTestId("btn-donation-next"));

    expect(await screen.findByText("El monto admite máximo 2 decimales.")).toBeInTheDocument();
    expect(screen.queryByTestId("input-donor-name")).not.toBeInTheDocument();
  });

  it("acepta montos con centavos (50.01) y avanza al paso 2", async () => {
    renderModal(vi.fn());
    const user = userEvent.setup();

    const amount = screen.getByTestId("donation-amount");
    await user.clear(amount);
    await user.type(amount, "50.01");
    await user.click(screen.getByTestId("btn-donation-next"));

    expect(await screen.findByTestId("input-donor-name")).toBeInTheDocument();
    expect(screen.queryByText("El monto admite máximo 2 decimales.")).not.toBeInTheDocument();
  });

  it("flujo completo de dinero: monto + método → éxito con aviso de pendiente", async () => {
    mocks.submitDonation.mockResolvedValue({
      id: 7,
      trackingCode: "RSR-2026-ZZ9Y8X",
      fulfillmentStatus: "pendiente_coordinacion",
      status: "pending",
      amount: 50.01,
      collaborationType: "dinero",
    });
    const onClose = vi.fn();
    renderModal(onClose);
    const user = userEvent.setup();

    const amount = screen.getByTestId("donation-amount");
    await user.clear(amount);
    await user.type(amount, "50.01");
    await user.click(screen.getByTestId("quick-amount-100"));
    await user.click(screen.getByTestId("btn-donation-next"));

    await user.type(screen.getByTestId("input-donor-name"), "Ana López");
    await user.type(screen.getByTestId("input-donor-phone"), "921615737");
    await user.type(screen.getByTestId("input-donor-email"), "ana@test.com");
    await user.click(screen.getByTestId("btn-submit-donation"));

    await waitFor(() => expect(mocks.submitDonation).toHaveBeenCalledTimes(1));
    const payload = mocks.submitDonation.mock.calls[0][0];
    expect(payload.collaborationType).toBe("dinero");
    // El botón rápido S/ 100 reemplazó al monto tecleado.
    expect(payload.amount).toBe(100);
    expect(payload.paymentMethod).toBe("yape");
    expect(payload.items).toBeUndefined();

    expect(await screen.findByTestId("donation-tracking-code")).toHaveTextContent("RSR-2026-ZZ9Y8X");
    // Se distingue claramente «solicitud registrada» de «pago recibido».
    expect(screen.getByText(/registrado como solicitud pendiente/i)).toBeInTheDocument();

    // Tras enviar, cerrar NO pregunta: el aporte ya está guardado.
    await user.click(screen.getByTestId("btn-donation-close-success"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AdminLogin from "@/pages/admin/login";
import { renderWithProviders } from "./test-utils";

const { loginMutateMock } = vi.hoisted(() => ({ loginMutateMock: vi.fn() }));

vi.mock("@workspace/api-client-react", () => ({
  useAdminLogin: () => ({ mutate: loginMutateMock, isPending: false }),
}));

describe("AdminLogin (login + 2FA)", () => {
  beforeEach(() => {
    loginMutateMock.mockReset();
  });

  it("valida campos vacíos al enviar", async () => {
    const user = userEvent.setup();
    renderWithProviders(<AdminLogin />);

    await user.click(screen.getByRole("button", { name: /iniciar sesión/i }));

    expect(await screen.findByText("Usuario requerido")).toBeInTheDocument();
    expect(screen.getByText("Contraseña requerida")).toBeInTheDocument();
    expect(loginMutateMock).not.toHaveBeenCalled();
  });

  it("con 2FA activo pide el código TOTP y otorga acceso", async () => {
    const user = userEvent.setup();
    loginMutateMock.mockImplementation((_args: unknown, opts?: { onSuccess?: (d: unknown) => void }) => {
      opts?.onSuccess?.({ success: false, twoFactorRequired: true, userId: 5 });
    });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    renderWithProviders(<AdminLogin />);
    await user.type(screen.getByLabelText("Usuario"), "admin");
    await user.type(screen.getByLabelText("Contraseña"), "secreto");
    await user.click(screen.getByRole("button", { name: /iniciar sesión/i }));

    // Paso 2: verificación en dos pasos (subtítulo <p>; el toast repite el texto)
    expect(
      await screen.findByText("Verificación en dos pasos", { selector: "p" }),
    ).toBeInTheDocument();

    const code = screen.getByLabelText("Código de verificación");
    await user.type(code, "123456");
    await user.click(screen.getByRole("button", { name: /verificar código/i }));

    expect(await screen.findByText("Acceso concedido")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/2fa/login",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ userId: 5, code: "123456" }),
      }),
    );
  });

  it("rechaza un código TOTP incorrecto", async () => {
    const user = userEvent.setup();
    loginMutateMock.mockImplementation((_args: unknown, opts?: { onSuccess?: (d: unknown) => void }) => {
      opts?.onSuccess?.({ success: false, twoFactorRequired: true, userId: 5 });
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));

    renderWithProviders(<AdminLogin />);
    await user.type(screen.getByLabelText("Usuario"), "admin");
    await user.type(screen.getByLabelText("Contraseña"), "secreto");
    await user.click(screen.getByRole("button", { name: /iniciar sesión/i }));

    const code = await screen.findByLabelText("Código de verificación");
    await user.type(code, "000000");
    await user.click(screen.getByRole("button", { name: /verificar código/i }));

    expect(
      await screen.findByText("Código de verificación incorrecto o expirado"),
    ).toBeInTheDocument();
  });
});

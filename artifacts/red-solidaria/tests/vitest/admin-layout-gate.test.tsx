// FE-03 / FE-04: gate del panel administrativo.
//
// Antes, CUALQUIER error de /api/admin/me mandaba al login (una caída del
// servidor se veía como «sesión expirada»), un rol sin permiso no se trataba y
// el caso de error devolvía una pantalla en blanco. Aquí se fija el
// comportamiento nuevo, con la decisión tomada por `resolvePanelGate` (probada
// aparte en tests/admin-session.test.mjs).
import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import AdminLayout from "@/pages/admin/layout";
import { renderWithProviders } from "./test-utils";

interface MeResult {
  data: unknown;
  isError: boolean;
  error: unknown;
  isLoading: boolean;
  refetch: () => void;
}

const me = vi.hoisted(() => ({ current: {} as MeResult }));

vi.mock("@workspace/api-client-react", () => ({
  useGetAdminMe: () => me.current,
  useAdminLogout: () => ({ mutate: vi.fn() }),
}));

const renderPanel = () =>
  renderWithProviders(
    <AdminLayout>
      <div>contenido del panel</div>
    </AdminLayout>,
  );

const session = (role: string) => ({ id: 1, username: "admin", name: "Admin", role });

describe("AdminLayout · gate del panel", () => {
  it("un fallo del servidor NO manda al login: lo explica y ofrece reintentar", () => {
    me.current = { data: undefined, isError: true, error: { status: 500 }, isLoading: false, refetch: vi.fn() };
    renderPanel();

    expect(screen.getByText(/No se pudo comprobar tu sesión/i)).toBeInTheDocument();
    expect(screen.getByText(/error \(500\)/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Reintentar/i })).toBeInTheDocument();
    expect(screen.queryByText("contenido del panel")).not.toBeInTheDocument();
  });

  it("un fallo de red (sin código) tampoco manda al login", () => {
    me.current = {
      data: undefined,
      isError: true,
      error: new Error("Failed to fetch"),
      isLoading: false,
      refetch: vi.fn(),
    };
    renderPanel();

    expect(screen.getByText(/No hubo respuesta del servidor/i)).toBeInTheDocument();
  });

  it("un rol sin permiso muestra acceso denegado, con el rol declarado", () => {
    me.current = { data: session("invitado"), isError: false, error: null, isLoading: false, refetch: vi.fn() };
    renderPanel();

    expect(screen.getByText(/no tiene acceso al panel/i)).toBeInTheDocument();
    expect(screen.getByText(/«invitado»/)).toBeInTheDocument();
    expect(screen.queryByText("contenido del panel")).not.toBeInTheDocument();
  });

  it("mientras carga muestra el esqueleto, no una pantalla en blanco", () => {
    me.current = { data: undefined, isError: false, error: null, isLoading: true, refetch: vi.fn() };
    renderPanel();

    expect(screen.getByText(/Cargando el panel/i)).toBeInTheDocument();
  });

  it("sin sesión (401) no deja la pantalla en blanco: redirige al acceso", () => {
    me.current = { data: undefined, isError: true, error: { status: 401 }, isLoading: false, refetch: vi.fn() };
    renderPanel();

    // No se muestra el panel, ni la pantalla de error del servidor, ni la de
    // acceso denegado: el 401 es «sin sesión» y su destino es el formulario.
    expect(screen.queryByText("contenido del panel")).not.toBeInTheDocument();
    expect(screen.queryByText(/No se pudo comprobar/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/no tiene acceso al panel/i)).not.toBeInTheDocument();
  });

  it("con sesión válida renderiza el panel", () => {
    me.current = { data: session("administrador"), isError: false, error: null, isLoading: false, refetch: vi.fn() };
    renderPanel();

    expect(screen.getByText("contenido del panel")).toBeInTheDocument();
  });
});

/**
 * Acceso al panel administrativo (Fase 8, FE-03 y FE-04).
 *
 * El gate del panel vivía disperso en el componente: cualquier error de
 * `/api/admin/me` mandaba al login (así que una caída del servidor se veía como
 * «sesión expirada»), un rol insuficiente no se trataba y el caso de error
 * devolvía una pantalla en blanco.
 *
 * Aquí está la DECISIÓN, como función pura y testeable:
 *   - `loading`        → todavía no se sabe: se muestra el esqueleto de carga.
 *   - `unauthenticated`→ 401: no hay sesión → al formulario de acceso.
 *   - `forbidden`      → 403 o un rol que no puede entrar → pantalla explicada.
 *   - `unavailable`    → cualquier otro fallo (500, red): NO se manda al login,
 *                        porque la sesión puede ser válida; se ofrece reintentar.
 *   - `ready`          → hay sesión y el rol puede entrar.
 *
 * El backend sigue siendo la autoridad: esto solo evita mostrar el panel a quien
 * no debe y explica lo que pasa en lugar de dejar la pantalla en blanco.
 */

/** Roles que pueden entrar al panel (los mismos que acepta la API). */
export const ADMIN_PANEL_ROLES = [
  "superadmin",
  "administrador",
  "moderador",
  "supervisor",
] as const;

export type AdminPanelRole = (typeof ADMIN_PANEL_ROLES)[number];

/** Ruta del formulario de acceso del panel. */
export const ADMIN_LOGIN_PATH = "/admin/login";

/** Normaliza un rol (recorta y pasa a minúsculas). `null` si no hay valor. */
export function normalizeRole(role: unknown): string | null {
  if (typeof role !== "string") return null;
  const normalized = role.trim().toLowerCase();
  return normalized ? normalized : null;
}

/** ¿El rol puede entrar al panel? Un rol desconocido o vacío no puede. */
export function isAdminPanelRole(role: unknown): role is AdminPanelRole {
  const normalized = normalizeRole(role);
  return normalized !== null && (ADMIN_PANEL_ROLES as readonly string[]).includes(normalized);
}

/**
 * Código HTTP de un error, sin depender de la clase concreta: el cliente
 * generado y el del panel tienen tipos `ApiError` distintos, así que se lee la
 * propiedad de forma defensiva. `null` si no se puede determinar.
 */
export function errorStatus(err: unknown): number | null {
  if (typeof err !== "object" || err === null) return null;
  const status = (err as { status?: unknown }).status;
  return typeof status === "number" && Number.isFinite(status) ? status : null;
}

export interface PanelGateUser {
  role?: unknown;
}

export type PanelGateState =
  | { state: "loading" }
  | { state: "unauthenticated"; redirectTo: string }
  | { state: "forbidden"; role: string | null }
  | { state: "unavailable"; status: number | null }
  | { state: "ready"; role: AdminPanelRole };

export interface ResolvePanelGateInput {
  /** La consulta de sesión sigue en curso. */
  isLoading: boolean;
  /** Error de la consulta de sesión (cualquier forma). */
  error: unknown;
  /** Usuario devuelto por `/api/admin/me` (si lo hay). */
  user: PanelGateUser | null | undefined;
}

export function resolvePanelGate({
  isLoading,
  error,
  user,
}: ResolvePanelGateInput): PanelGateState {
  // Con datos ya cargados, un error posterior no debe expulsar al usuario.
  if (user) {
    return isAdminPanelRole(user.role)
      ? { state: "ready", role: normalizeRole(user.role) as AdminPanelRole }
      : { state: "forbidden", role: normalizeRole(user.role) };
  }

  if (isLoading) return { state: "loading" };

  if (error !== null && error !== undefined) {
    const status = errorStatus(error);
    if (status === 401) return { state: "unauthenticated", redirectTo: ADMIN_LOGIN_PATH };
    // 403 es «hay sesión, pero este rol no entra»: no se le manda al login.
    if (status === 403) return { state: "forbidden", role: null };
    // 500, error de red o error sin código: la sesión puede ser válida.
    return { state: "unavailable", status };
  }

  // Sin error, sin datos y sin carga: no hay sesión utilizable.
  if (!user) return { state: "unauthenticated", redirectTo: ADMIN_LOGIN_PATH };

  return { state: "forbidden", role: null };
}

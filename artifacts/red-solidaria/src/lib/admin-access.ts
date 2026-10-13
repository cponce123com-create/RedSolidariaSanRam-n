/**
 * Destino del acceso administrativo del navbar.
 *
 * Función pura (sin React) para poder testearla: un visitante va al formulario
 * de login; un administrador ya autenticado entra directamente al panel.
 * No hay login paralelo: ambos destinos usan el sistema de sesión existente.
 */
export function resolveAdminTarget(isAuthenticated: boolean): {
  href: string;
  labelKey: string;
} {
  return isAuthenticated
    ? { href: "/admin", labelKey: "nav.adminPanel" }
    : { href: "/admin/login", labelKey: "nav.adminAccess" };
}

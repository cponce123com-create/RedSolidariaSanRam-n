import type { NextFunction, Request, RequestHandler, Response } from "express";

/**
 * Roles del sistema de administración.
 * - superadmin: acceso total (gestión de usuarios, configuración, 2FA reset).
 * - administrador: operaciones completas (campañas, donaciones, gastos, stats).
 * - moderador: gestión de contenido y comunidad (campañas, reportes, adopciones,
 *   noticias, mensajes, etc.), SIN acceso a dinero ni sistema.
 * - supervisor: SOLO CONSULTA. Revisa donaciones, informes y auditoría y puede
 *   dejar observaciones, pero NO modifica dinero, campañas ni configuración.
 */
export const ROLES = {
  SUPERADMIN: "superadmin",
  ADMIN: "administrador",
  MODERATOR: "moderador",
  SUPERVISOR: "supervisor",
} as const;

export type AdminRole = (typeof ROLES)[keyof typeof ROLES];

/**
 * Roles con permiso de CONSULTA sobre la información contable y de auditoría.
 * El superadmin siempre pasa (ver `hasRole`).
 */
export const READ_ROLES: string[] = [ROLES.ADMIN, ROLES.SUPERVISOR];

/**
 * Verifica que el usuario de sesión tenga alguno de los roles permitidos.
 * El superadmin siempre pasa (el superadmin de respaldo por env var usa id 0).
 */
export function hasRole(
  user: { role?: string | null } | undefined,
  ...allowed: string[]
): boolean {
  if (!user?.role) return false;
  if (user.role === ROLES.SUPERADMIN) return true;
  return allowed.includes(user.role);
}

/** El moderador queda fuera de los datos contables privados. */
export function canReadFinance(user: { role?: string | null } | null | undefined): boolean {
  return hasRole(user ?? undefined, ...READ_ROLES);
}

/**
 * Middleware factory: exige sesión de administrador con alguno de los roles
 * permitidos. Se usa DESPUÉS de requireAdmin (autenticación) para autorizar.
 * Rechaza con 403 si el rol no tiene permiso.
 */
export function requireRole(...allowed: string[]): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = req.session?.adminUser;
    if (!user || !hasRole(user, ...allowed)) {
      return res.status(403).json({
        error: "forbidden",
        message: "No tienes permisos para esta acción",
      });
    }
    return next();
  };
}

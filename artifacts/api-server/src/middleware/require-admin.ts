import type { NextFunction, Request, Response } from "express";

/**
 * Middleware de autenticación para rutas administrativas.
 * Rechaza con 401 si no hay un adminUser en la sesión.
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.session?.adminUser) {
    return res
      .status(401)
      .json({ error: "unauthorized", message: "No autenticado" });
  }
  return next();
}

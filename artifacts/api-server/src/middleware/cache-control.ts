import type { Request, Response, NextFunction } from "express";

/**
 * Caché pública para GETs del API que no exponen datos sensibles.
 *
 * El frontend ya cachea 60s en cliente (React Query); esta cabecera permite que
 * proxies/CDNs intermedios hagan lo mismo y alivia la DB en picos de tráfico.
 * Solo aplica a GETs ANÓNIMOS de endpoints públicos: las rutas admin (más las
 * de donaciones, que llevan datos personales aunque tengan requireAdmin) y el
 * health check quedan excluidas para no cachear datos privados ni enmascarar
 * caídas del servicio.
 *
 * POR QUÉ SE EXCLUYE CUALQUIER PETICIÓN CON COOKIE (Fase 1 — sincronización):
 * una misma ruta pública devuelve contenido distinto según la sesión (p. ej.
 * `/api/campaigns` oculta borradores al público pero no al administrador) y,
 * sobre todo, el administrador que acaba de guardar un cambio NO puede recibir
 * una respuesta servida por la caché del navegador: eso era una de las causas
 * de que «los cambios del panel no se vean». Con sesión → `private, no-store`;
 * sin sesión → caché pública de 60s + `Vary: Cookie` para que ninguna caché
 * compartida mezcle ambas variantes.
 */
const MAX_AGE_SECONDS = 60;

function isPublicCacheable(path: string): boolean {
  if (
    path.startsWith("/admin") ||
    path.startsWith("/contact/messages") ||
    path === "/healthz"
  ) {
    return false;
  }
  const segments = path.split("/").filter(Boolean);
  if (segments.length === 0) return false;
  // /donations y /donations/:id... son admin (requireAdmin); solo /donations/stats es público.
  if (segments[0] === "donations")
    return segments.length === 2 && segments[1] === "stats";
  // /campaigns/:id/donations es admin; el resto de /campaigns/* es público.
  if (
    segments[0] === "campaigns" &&
    segments.length >= 3 &&
    segments[2] === "donations"
  ) {
    return false;
  }
  return true;
}

/** Hay sesión si viaja la cookie de sesión (no hace falta parsearla). */
function hasSessionCookie(req: Request): boolean {
  const cookie = req.headers.cookie;
  return typeof cookie === "string" && cookie.length > 0;
}

export function publicApiCache(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (req.method === "GET" && isPublicCacheable(req.path)) {
    if (hasSessionCookie(req)) {
      // Sesión iniciada (administrador/coordinación): nunca desde caché.
      res.setHeader("Cache-Control", "private, no-store");
    } else {
      res.setHeader("Cache-Control", `public, max-age=${MAX_AGE_SECONDS}`);
      res.setHeader("Vary", "Cookie");
    }
  }
  next();
}

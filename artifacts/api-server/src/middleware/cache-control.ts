import type { Request, Response, NextFunction } from "express";

/** Public mutable data must be revalidated before reuse. Session responses are
 * private/no-store; anonymous responses may retain ETags but cannot be reused
 * without checking the current publication/consent state with the origin. */
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
      // Revalidate before reuse: a deleted/unpublished record must not survive
      // another successful request just because a browser/CDN has a fresh copy.
      res.setHeader("Cache-Control", "public, no-cache");
      res.setHeader("Vary", "Cookie");
    }
  }
  next();
}

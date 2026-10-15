import type { NextFunction, Request, Response } from "express";

/**
 * Defensa CSRF por ORIGEN (V14-1.4) — lógica PURA + middleware fino.
 *
 * ESTADO PREVIO (ya correcto, por eso esto es defensa EN PROFUNDIDAD)
 * -------------------------------------------------------------------
 * La cookie de sesión es `httpOnly`, `secure` en producción y **`sameSite: "lax"`**,
 * así que un formulario cross-site NO la envía en un POST: la base ya estaba cubierta.
 * Pero `sameSite` depende del navegador y de que no se relaje por error, y una
 * petición de escritura nunca debería aceptarse «porque el navegador se porte bien».
 *
 * REGLA (precisa, sin romper nada)
 * --------------------------------
 * Para métodos que CAMBIAN estado (POST/PUT/PATCH/DELETE):
 *   1. `Sec-Fetch-Site: cross-site` → se rechaza (lo envían los navegadores modernos).
 *   2. Sin cabecera `Origin` → se acepta: no es un navegador (curl, el propio E2E,
 *      integraciones). Sin navegador no hay CSRF; y sin cookie robada no hay sesión.
 *   3. `Origin` con el MISMO host que la petición → se acepta. Es una petición
 *      legítima del propio panel, aunque el dominio público no esté en la lista
 *      (evita romper despliegues que entran por la URL de Render).
 *   4. `Origin` en la lista de orígenes permitidos → se acepta.
 *   5. Cualquier otro `Origin` → **403**.
 */

export const STATE_CHANGING_METHODS = ["POST", "PUT", "PATCH", "DELETE"] as const;

export interface OriginCheckInput {
  method: string;
  /** Cabecera `Origin` (la envían los navegadores en las peticiones de escritura). */
  origin: string | null;
  /** Cabecera `Host` de la propia petición, para reconocer el mismo origen. */
  host: string | null;
  /** `Sec-Fetch-Site`: `same-origin`, `same-site`, `cross-site` o `none`. */
  secFetchSite: string | null;
  /** Orígenes permitidos por CORS (vacíos en desarrollo). */
  allowedOrigins: readonly string[];
}

export type OriginVerdict =
  | { ok: true }
  | { ok: false; reason: "cross_site" | "origin_not_allowed" };

function normalize(value: string): string {
  return value.trim().replace(/\/+$/, "").toLowerCase();
}

/** Host de un origen (`https://a.com:443` → `a.com:443`). Cadena vacía si no es URL. */
function hostOf(origin: string): string {
  try {
    return new URL(origin).host.toLowerCase();
  } catch {
    return "";
  }
}

/** ¿La petición es aceptable según su origen? Puro y determinista. */
export function checkRequestOrigin(input: OriginCheckInput): OriginVerdict {
  const method = input.method.toUpperCase();
  if (!(STATE_CHANGING_METHODS as readonly string[]).includes(method)) {
    return { ok: true };
  }
  if (input.secFetchSite === "cross-site") {
    return { ok: false, reason: "cross_site" };
  }
  if (!input.origin) {
    return { ok: true };
  }

  const origin = normalize(input.origin);
  const host = input.host ? normalize(input.host) : "";
  // Mismo origen: el panel hablando consigo mismo. Se compara el HOST, no el esquema,
  // para no depender de si el proxy interno ve http o https.
  if (host && hostOf(origin) === host) {
    return { ok: true };
  }
  if (input.allowedOrigins.some((allowed) => normalize(allowed) === origin)) {
    return { ok: true };
  }
  return { ok: false, reason: "origin_not_allowed" };
}

/**
 * Middleware: rechaza las escrituras cross-site con 403 antes de tocar la sesión, la
 * base de datos o cualquier limitador.
 */
export function createCsrfOriginGuard(allowedOrigins: readonly string[]) {
  return function csrfOriginGuard(req: Request, res: Response, next: NextFunction): void {
    const verdict = checkRequestOrigin({
      method: req.method,
      origin: req.get("origin") ?? null,
      host: req.get("host") ?? null,
      secFetchSite: req.get("sec-fetch-site") ?? null,
      allowedOrigins,
    });
    if (verdict.ok) {
      next();
      return;
    }
    res.status(403).json({
      error: "csrf_origin_rejected",
      code: verdict.reason,
      message: "Petición rechazada: origen no permitido para una operación de escritura.",
    });
  };
}

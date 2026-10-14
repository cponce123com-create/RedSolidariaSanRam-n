/**
 * Configuración de seguridad derivada del entorno (Prompt Maestro V7.1 · Fase 3).
 *
 * Hallazgos SEC-01 y SEC-05 de la auditoría: la cookie de sesión solo era
 * `secure` si `NODE_ENV==='production'` (un despliegue que sirviera HTTPS sin
 * fijar `NODE_ENV` viajaba con la cookie por HTTP), y CORS aceptaba un comodín
 * sin comprobarlo (con `credentials: true` un `*` es una configuración inválida
 * y peligrosa).
 *
 * Estas funciones son PURAS (reciben el entorno como objeto) y testeables: la
 * app las usa al arrancar. NO desactivan ninguna validación de seguridad; solo
 * derivan la decisión del entorno y fallan el arranque ante una configuración
 * insegura.
 */

export interface SecurityEnv {
  NODE_ENV?: string | undefined;
  SITE_URL?: string | undefined;
  CORS_ORIGIN?: string | undefined;
}

export function isProductionEnv(env: SecurityEnv): boolean {
  return env.NODE_ENV === "production";
}

function isHttpsUrl(value: string | undefined): boolean {
  return typeof value === "string" && /^https:\/\//i.test(value.trim());
}

/** Origen (esquema + host + puerto) de una URL, o `null` si no es válida. */
export function siteOrigin(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url.trim());
    return parsed.origin;
  } catch {
    return null;
  }
}

/**
 * ¿Debe marcarse la cookie de sesión como `Secure`? Sí en producción o cuando
 * el sitio se sirve por HTTPS (`SITE_URL`), aunque falte `NODE_ENV`. Así la
 * cookie nunca viaja por HTTP en un despliegue HTTPS mal etiquetado.
 */
export function resolveCookieSecure(env: SecurityEnv): boolean {
  return isProductionEnv(env) || isHttpsUrl(env.SITE_URL);
}

/**
 * Origen permitido por CORS. Con `credentials: true` NUNCA se permite `*`:
 *  - Si `CORS_ORIGIN` está definido, se usa tal cual (la validación de arranque
 *    rechaza el comodín en producción).
 *  - Si no, en producción se usa el origen del sitio (`SITE_URL`) o el dominio
 *    por defecto del despliegue.
 *  - En desarrollo se refleja el origen de la petición (`true`) para Vite.
 */
export function resolveCorsOrigin(env: SecurityEnv): string | true {
  const explicit = env.CORS_ORIGIN?.trim();
  if (explicit) return explicit;
  if (isProductionEnv(env)) {
    return siteOrigin(env.SITE_URL) ?? "https://redsolidariasanramon.org";
  }
  return true;
}

/**
 * Errores de configuración de seguridad que deben impedir el arranque en
 * producción. Devuelve la lista de problemas (vacía si todo está bien): la app
 * los convierte en un error de arranque, nunca en una advertencia silenciosa.
 */
export function validateSecurityConfig(env: SecurityEnv): string[] {
  const errors: string[] = [];
  if (!isProductionEnv(env)) return errors;

  const cors = env.CORS_ORIGIN?.trim();
  if (cors === "*") {
    errors.push(
      "CORS_ORIGIN no puede ser '*' en producción: el API usa credenciales (cookies de sesión). " +
        "Indica el origen exacto del frontend (p. ej. https://redsolidariasanramon.org).",
    );
  }

  if (env.SITE_URL && !isHttpsUrl(env.SITE_URL) && env.SITE_URL.trim() !== "") {
    errors.push(
      "SITE_URL debe ser HTTPS en producción: la cookie de sesión viaja con Secure.",
    );
  }

  return errors;
}

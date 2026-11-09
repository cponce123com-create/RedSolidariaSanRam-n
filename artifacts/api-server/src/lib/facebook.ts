export interface FacebookConnectionStatus {
  status: "not_configured" | "invalid_configuration" | "invalid_token" | "wrong_page" | "permission_denied" | "unavailable" | "connected";
  pageIdConfigured: boolean;
  tokenConfigured: boolean;
  message: string;
  page?: { id: string; name: string };
  publishingVerified: false;
}

/** Read-only identity check. Never return credentials or raw Meta errors. */
export async function checkFacebookConnection(
  env: { FACEBOOK_PAGE_ID?: string; FACEBOOK_PAGE_ACCESS_TOKEN?: string } = process.env,
  request: typeof fetch = fetch,
): Promise<FacebookConnectionStatus> {
  const pageId = env.FACEBOOK_PAGE_ID?.trim() ?? "";
  const token = env.FACEBOOK_PAGE_ACCESS_TOKEN?.trim() ?? "";
  const base = { pageIdConfigured: Boolean(pageId), tokenConfigured: Boolean(token), publishingVerified: false as const };
  if (!pageId || !token) return { ...base, status: "not_configured", message: "Falta configurar el ID o el token de la página en el servidor." };
  if (!/^\d+$/.test(pageId)) return { ...base, status: "invalid_configuration", message: "El ID de la página debe contener únicamente números." };
  try {
    // /me identifies the token's owner: a user token must not pass as a Page token.
    // Authorization stays out of URLs, browser bundles and application logs.
    const response = await request("https://graph.facebook.com/v27.0/me?fields=id,name", {
      method: "GET", headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: AbortSignal.timeout(10_000), redirect: "error", cache: "no-store",
    });
    const body: unknown = await response.json();
    const data = body && typeof body === "object" ? body as Record<string, unknown> : {};
    if (!response.ok) {
      const error = data.error && typeof data.error === "object" ? data.error as Record<string, unknown> : {};
      if (error.code === 190) return { ...base, status: "invalid_token", message: "Meta rechazó el token: puede haber caducado o haber sido revocado." };
      if (error.code === 10 || error.code === 200) return { ...base, status: "permission_denied", message: "Meta rechazó el acceso. Revisa los permisos concedidos a la página." };
      return { ...base, status: "unavailable", message: "No se pudo comprobar la conexión con Meta. Intenta nuevamente." };
    }
    if (typeof data.id !== "string" || typeof data.name !== "string" || !data.name.trim()) {
      return { ...base, status: "unavailable", message: "Meta no devolvió una identidad de página válida." };
    }
    if (data.id !== pageId) return { ...base, status: "wrong_page", message: "El token pertenece a otro usuario o página. Usa el token de la página configurada." };
    return { ...base, status: "connected", page: { id: data.id, name: data.name },
      message: "La identidad de la página está verificada." };
  } catch {
    // Exceptions can contain request headers or provider payloads. Do not expose/log them.
    return { ...base, status: "unavailable", message: "No se pudo contactar con Meta dentro del tiempo disponible. Intenta nuevamente." };
  }
}

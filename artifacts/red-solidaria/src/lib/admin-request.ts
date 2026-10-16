import { ApiError, readErrorMessage } from "@/lib/api-error";

/**
 * Cliente de peticiones del panel administrativo (Fase 1 — sincronización).
 *
 * Regla del proyecto: NINGUNA mutación puede mostrar éxito sin comprobar
 * `response.ok`. `fetch` resuelve también en 400/401/403/404/409/500, así que
 * comprobar `res.ok` a mano en cada página es fácil de olvidar (y así se coló el
 * falso éxito que dejaba contenido publicado). Estos helpers centralizan la
 * comprobación y convierten el `{ error, message }` REAL del servidor en un
 * `ApiError`, de modo que el panel muestre el motivo verdadero.
 */

/** Ejecuta la petición y lanza `ApiError(status, mensaje real)` si no es 2xx. */
export async function adminRequest(url: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(url, { credentials: "include", ...init });
  if (!res.ok) throw new ApiError(res.status, await readErrorMessage(res));
  return res;
}

/** Igual que `adminRequest` pero devuelve el JSON ya tipado. */
export async function adminRequestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await adminRequest(url, init);
  return (await res.json()) as T;
}

/** Para operaciones sin cuerpo de respuesta (DELETE/POST que responden 204). */
export async function adminRequestNoContent(url: string, init?: RequestInit): Promise<void> {
  await adminRequest(url, init);
}

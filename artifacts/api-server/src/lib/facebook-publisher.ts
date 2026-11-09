import { checkFacebookConnection } from "./facebook";

export const FACEBOOK_SOURCES = ["news", "campaign", "donation", "pet", "report", "update", "campaign_result"] as const;
export type FacebookSource = typeof FACEBOOK_SOURCES[number];
export function isFacebookSource(value: unknown): value is FacebookSource {
  return typeof value === "string" && (FACEBOOK_SOURCES as readonly string[]).includes(value);
}
export interface FacebookPublishEnv {
  FACEBOOK_PAGE_ID?: string; FACEBOOK_PAGE_ACCESS_TOKEN?: string;
  FACEBOOK_AUTO_PUBLISH_ENABLED?: string; SITE_URL?: string;
}
export interface FacebookContent { kind: FacebookSource; id: number; title: string; summary: string; imageUrl?: string | null; path?: string }
export type FacebookSendResult =
  | { kind: "published"; postId: string; postUrl: string }
  | { kind: "retry" | "failed" | "uncertain"; message: string };

export function facebookPublishConfiguration(env: FacebookPublishEnv = process.env) {
  const pageId = env.FACEBOOK_PAGE_ID?.trim() ?? "";
  const token = env.FACEBOOK_PAGE_ACCESS_TOKEN?.trim() ?? "";
  let siteUrl: string | null = null;
  try {
    const url = new URL(env.SITE_URL?.trim() ?? "");
    if (url.protocol === "https:" && !url.username && !url.password && url.pathname === "/" && !url.search && !url.hash
      && !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) siteUrl = url.origin;
  } catch { /* Show a configuration error without leaking values. */ }
  return { pageId, token, siteUrl, enabled: !["false", "0"].includes(env.FACEBOOK_AUTO_PUBLISH_ENABLED?.trim().toLowerCase() ?? "")
    && /^\d+$/.test(pageId) && Boolean(token) && Boolean(siteUrl) };
}

export function facebookMessage(content: FacebookContent, siteUrl: string): { message: string; link: string } {
  const plain = (s: string) => s.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  const routes: Record<FacebookSource, string> = {
    news: `/noticias/${content.id}`, campaign: `/campanas/${content.id}`, donation: "/transparencia",
    pet: `/adopciones/${content.id}`, report: "/casos-urgentes", update: "/campanas", campaign_result: `/campanas/${content.id}/transparencia`,
  };
  const link = `${siteUrl}${content.path ?? routes[content.kind]}`;
  return { message: `${plain(content.title).slice(0, 300)}\n\n${plain(content.summary).slice(0, 1800)}\n\n${link}`, link };
}

/** At most one write per attempt. A lost response must never trigger a blind retry. */
export async function sendFacebookPublication(content: FacebookContent, env: FacebookPublishEnv = process.env, request: typeof fetch = fetch): Promise<FacebookSendResult> {
  const config = facebookPublishConfiguration(env);
  if (!config.enabled || !config.siteUrl) return { kind: "failed", message: "Revisa el ID, token, SITE_URL y la activación de publicación automática." };
  const identity = await checkFacebookConnection(env, request);
  if (identity.status !== "connected") return { kind: identity.status === "unavailable" ? "retry" : "failed", message: identity.message };
  const { message, link } = facebookMessage(content, config.siteUrl);
  let imageUrl: string | null = null;
  try {
    const image = new URL(content.imageUrl ?? "");
    if (image.protocol === "https:" && !image.username && !image.password) imageUrl = image.href;
  } catch { /* Text + link is also a valid publication. */ }
  const body = new URLSearchParams(imageUrl ? { url: imageUrl, caption: message } : { message, link });
  try {
    const response = await request(`https://graph.facebook.com/v27.0/${config.pageId}/${imageUrl ? "photos" : "feed"}`, {
      method: "POST", headers: { Authorization: `Bearer ${config.token}`, "Content-Type": "application/x-www-form-urlencoded" },
      body, signal: AbortSignal.timeout(15_000), redirect: "error",
    });
    const raw: unknown = await response.json();
    const data = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
    if (response.ok) {
      const id = data.post_id ?? data.id;
      if (typeof id === "string" && /^\d+(?:_\d+)?$/.test(id)) return { kind: "published", postId: id, postUrl: `https://www.facebook.com/${id}` };
      return { kind: "uncertain", message: "Meta respondió sin un identificador verificable. Revisa la página antes de reintentar." };
    }
    const error = data.error && typeof data.error === "object" ? data.error as Record<string, unknown> : {};
    if (response.status >= 500) return { kind: "uncertain", message: "Meta devolvió un error de servidor. Revisa si publicó antes de reintentar." };
    if (response.status === 429 || [4, 17, 32, 613].includes(Number(error.code))) return { kind: "retry", message: "Meta limitó temporalmente los envíos. Se reintentará automáticamente." };
    if (error.code === 190) return { kind: "failed", message: "El token caducó o fue revocado. Actualízalo en Render y reintenta." };
    if ([10, 200].includes(Number(error.code))) return { kind: "failed", message: "Meta no autorizó publicar. Revisa pages_manage_posts y el acceso a la página." };
    return { kind: "failed", message: "Meta rechazó la publicación. Revisa permisos, enlace e imagen y reintenta." };
  } catch {
    return { kind: "uncertain", message: "Se perdió la respuesta de Meta. Comprueba si la publicación existe antes de reintentar." };
  }
}

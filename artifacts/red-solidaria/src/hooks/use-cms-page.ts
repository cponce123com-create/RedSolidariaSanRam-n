import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminRequestJson } from "@/lib/admin-request";
import { ADMIN_CMS_KEY, ADMIN_CMS_LIST_KEY, CMS_KEY } from "@/lib/query-keys";
import { invalidateCmsQueries } from "@/lib/query-invalidation";
import type { PublicCmsPage } from "@/lib/cms";

/**
 * Hooks del CMS institucional (Fase 2–3).
 *
 * Contrato único: la web pública lee `GET /api/cms/pages/:slug` (solo lo PUBLICADO) y
 * el panel lee/escribe `/api/admin/cms/pages/:slug` (borrador + publicado + VERSIÓN).
 * Ambas claves comparten la entidad `cms`, así que guardar o publicar refresca el
 * panel Y la web con la misma invalidación.
 *
 * Cada escritura envía la `version` leída: si otra sesión escribió antes, la API
 * responde 409 y el panel avisa en vez de pisar cambios ajenos. Publicar envía
 * también el contenido pendiente: se guarda y se publica EXACTAMENTE eso.
 */

export interface CmsFieldSchema {
  name: string;
  kind: "text" | "richText" | "url" | "image" | "enum" | "list";
  values?: string[];
  fields?: CmsFieldSchema[];
}

export interface CmsBlockSchema {
  type: string;
  label: string;
  /** `true` = bloque de datos calculados desde Neon (sin cifras editables). */
  reference: boolean;
  fields: CmsFieldSchema[];
}

export interface CmsDraftBlock {
  id: string;
  type: string;
  enabled: boolean;
  order: number;
  fields: Record<string, unknown>;
}

export interface CmsDraftContent {
  blocks: CmsDraftBlock[];
}

export interface AdminCmsPage {
  slug: string;
  title: string;
  wired: boolean;
  blocks: CmsBlockSchema[];
  draft: CmsDraftContent;
  published: PublicCmsPage | null;
  status: string;
  version: number;
  publishedAt: string | null;
  scheduledAt: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
  hasPendingChanges: boolean;
}

export interface CmsPageSummary {
  slug: string;
  title: string;
  wired: boolean;
  status: string;
  version: number;
  publishedAt: string | null;
  scheduledAt: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
  hasPendingChanges: boolean;
}

export interface CmsWriteResponse {
  draft: CmsDraftContent;
  published: PublicCmsPage | null;
  status?: string;
  version: number;
  publishedAt?: string | null;
  scheduledAt?: string | null;
  hasPendingChanges: boolean;
  removedAssets?: { deleted: number; failed: string[] };
}

export interface CmsVersionEntry {
  id: number;
  version: number;
  action: string;
  note: string | null;
  createdAt: string;
  createdBy: string | null;
}

export interface CmsSignature {
  cloudName: string;
  apiKey: string;
  timestamp: string;
  publicId: string;
  folder: string;
  allowedFormats: string;
  signature: string;
  page: string;
}

/**
 * Página PUBLICADA que consume la web. `null` = sin publicar (usa i18n).
 *
 * Modo PREVISUALIZACIÓN: con `?cmsPreview=1` en la URL (lo usa el iframe del editor) se
 * lee el BORRADOR del panel en vez de lo publicado. Solo funciona con sesión de
 * superadmin: un visitante anónimo recibe 403 y se cae a lo publicado sin efectos.
 */
export function useCmsPage(slug: string) {
  return useQuery<PublicCmsPage | null>({
    queryKey: [CMS_KEY, slug],
    queryFn: async () => {
      if (typeof window !== "undefined" && new URLSearchParams(window.location.search).has("cmsPreview")) {
        try {
          const previewRes = await fetch(`/api/admin/cms/pages/${slug}`, { credentials: "include" });
          if (previewRes.ok) {
            const data = (await previewRes.json()) as {
              draft?: { blocks?: { id: string; type: string; order: number; enabled: boolean; fields: Record<string, unknown> }[] };
            };
            const blocks = Array.isArray(data.draft?.blocks) ? data.draft.blocks : [];
            if (blocks.length > 0) {
              return {
                slug,
                publishedAt: null,
                blocks: blocks.map((block) => ({
                  id: block.id,
                  type: block.type,
                  order: block.order,
                  enabled: block.enabled !== false,
                  fields: block.fields ?? {},
                })),
              } satisfies PublicCmsPage;
            }
          }
        } catch {
          /* sin sesión o error: se muestra lo publicado */
        }
      }
      const res = await fetch(`/api/cms/pages/${slug}`);
      if (!res.ok) return null;
      return (await res.json()) as PublicCmsPage | null;
    },
    staleTime: 60_000,
  });
}

/** Listado de páginas del CMS con su estado (solo superadmin). */
export function useAdminCmsPages() {
  return useQuery<{ pages: CmsPageSummary[] }>({
    queryKey: [ADMIN_CMS_LIST_KEY],
    queryFn: () => adminRequestJson<{ pages: CmsPageSummary[] }>("/api/admin/cms/pages"),
  });
}

/** Borrador + publicado + versión + esquema de bloques, para el editor. */
export function useAdminCmsPage(slug: string) {
  return useQuery<AdminCmsPage>({
    queryKey: [ADMIN_CMS_KEY, slug],
    queryFn: () => adminRequestJson<AdminCmsPage>(`/api/admin/cms/pages/${slug}`),
    enabled: Boolean(slug),
  });
}

export function useSaveCmsDraft(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ content, version }: { content: CmsDraftContent; version: number }) =>
      adminRequestJson<CmsWriteResponse>(`/api/admin/cms/pages/${slug}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, version }),
      }),
    onSuccess: () => invalidateCmsQueries(queryClient),
  });
}

/** Publicar = GUARDAR + PUBLICAR en una sola operación (se publica lo guardado). */
export function usePublishCmsPage(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ content, version }: { content: CmsDraftContent; version: number }) =>
      adminRequestJson<CmsWriteResponse>(`/api/admin/cms/pages/${slug}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, version }),
      }),
    onSuccess: () => invalidateCmsQueries(queryClient),
  });
}

export function useUnpublishCmsPage(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ version }: { version: number }) =>
      adminRequestJson<CmsWriteResponse>(`/api/admin/cms/pages/${slug}/unpublish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version }),
      }),
    onSuccess: () => invalidateCmsQueries(queryClient),
  });
}

export function useScheduleCmsPage(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      content,
      version,
      scheduledAt,
    }: {
      content: CmsDraftContent;
      version: number;
      scheduledAt: string;
    }) =>
      adminRequestJson<CmsWriteResponse>(`/api/admin/cms/pages/${slug}/schedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, version, scheduledAt }),
      }),
    onSuccess: () => invalidateCmsQueries(queryClient),
  });
}

export function useCmsVersions(slug: string) {
  return useQuery<{ versions: CmsVersionEntry[] }>({
    queryKey: [ADMIN_CMS_KEY, slug, "versions"],
    queryFn: () =>
      adminRequestJson<{ versions: CmsVersionEntry[] }>(`/api/admin/cms/pages/${slug}/versions`),
    enabled: Boolean(slug),
  });
}

export function useRestoreCmsVersion(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ versionId, version }: { versionId: number; version: number }) =>
      adminRequestJson<CmsWriteResponse>(`/api/admin/cms/pages/${slug}/restore`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId, version }),
      }),
    onSuccess: () => invalidateCmsQueries(queryClient),
  });
}

/** Descarta (borra en Cloudinary) imágenes reemplazadas antes de guardar. */
export function useDiscardCmsAssets(slug: string) {
  return useMutation({
    mutationFn: (publicIds: string[]) =>
      adminRequestJson<{ discarded: number; failed: string[]; skipped: number }>(
        "/api/admin/cms/assets/discard",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ page: slug, publicIds }),
        },
      ),
  });
}

/** Firma firmada por el servidor para subir una imagen a la carpeta `cms/<slug>`. */
export function useCmsSignature(slug: string) {
  return useMutation({
    mutationFn: () =>
      adminRequestJson<CmsSignature>("/api/uploads/cms-signature", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ page: slug }),
      }),
  });
}

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminRequestJson } from "@/lib/admin-request";
import { ADMIN_IDENTITY_KEY, IDENTITY_KEY } from "@/lib/query-keys";
import { invalidateIdentityQueries } from "@/lib/query-invalidation";

/**
 * Hooks de la identidad institucional (Fase 3 · V18).
 *
 * Contrato único: la web pública lee `GET /api/institutional-identity` (solo lo
 * PUBLICADO) y el panel lee/escribe `/api/admin/institutional-identity` (borrador +
 * publicado + VERSIÓN). Ambas claves comparten la entidad `identity`, así que
 * guardar o publicar refresca el panel Y la web con la misma invalidación.
 *
 * V18: cada escritura envía la `version` leída. Si otra sesión escribió antes, la API
 * responde 409 y el panel avisa en vez de pisar cambios ajenos. Publicar envía
 * también el contenido pendiente: se guarda y se publica EXACTAMENTE eso.
 */

/** Activo de imagen: URL pública + identificador interno (para poder borrarlo). */
export interface InstitutionalAsset {
  url: string;
  publicId: string | null;
}

export interface InstitutionalValue {
  title: string;
  description: string;
}

export interface InstitutionalIdentityContent {
  logo: InstitutionalAsset;
  cover: {
    desktopUrl: string;
    mobileUrl: string;
    publicId: string | null;
    focus: string;
  };
  favicon: InstitutionalAsset;
  hero: { title: string; subtitle: string; ctaLabel: string; ctaHref: string };
  story: { title: string; subtitle: string; html: string; photos: string[] };
  mission: string;
  vision: string;
  values: InstitutionalValue[];
}

export interface PublicInstitutionalIdentity extends InstitutionalIdentityContent {
  publishedAt: string | null;
}

export interface AdminInstitutionalIdentity {
  draft: InstitutionalIdentityContent;
  published: PublicInstitutionalIdentity | null;
  publishedAt: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
  /** Token de concurrencia: se envía en cada escritura. */
  version: number;
  /** `true` si el borrador guardado difiere de lo publicado. */
  hasPendingChanges: boolean;
}

export interface IdentityWriteResponse {
  draft: InstitutionalIdentityContent;
  published: PublicInstitutionalIdentity | null;
  publishedAt: string | null;
  version: number;
  hasPendingChanges: boolean;
  removedAssets?: { deleted: number; failed: string[] };
}

export interface DiscardAssetsResponse {
  discarded: number;
  failed: string[];
  skipped: number;
}

export function emptyIdentityContent(): InstitutionalIdentityContent {
  return {
    logo: { url: "", publicId: null },
    cover: { desktopUrl: "", mobileUrl: "", publicId: null, focus: "50% 50%" },
    favicon: { url: "", publicId: null },
    hero: { title: "", subtitle: "", ctaLabel: "", ctaHref: "" },
    story: { title: "", subtitle: "", html: "", photos: [] },
    mission: "",
    vision: "",
    values: [],
  };
}

/**
 * Huella del contenido para detectar CAMBIOS SIN GUARDAR en el panel. Mismo criterio
 * que el servidor (JSON del contenido normalizado).
 */
export function identityFingerprint(content: InstitutionalIdentityContent): string {
  return JSON.stringify(content);
}

/**
 * Identidad PUBLICADA que consume la web pública. `null` = sin publicar (la web usa
 * su contenido por defecto; nunca se rompe la página «Nosotros»).
 */
export function useInstitutionalIdentity() {
  return useQuery<PublicInstitutionalIdentity | null>({
    queryKey: [IDENTITY_KEY],
    queryFn: async () => {
      const res = await fetch("/api/institutional-identity");
      if (!res.ok) return null;
      return (await res.json()) as PublicInstitutionalIdentity | null;
    },
    staleTime: 60_000,
  });
}

/** Borrador + publicado + versión, para el panel (solo superadmin). */
export function useAdminInstitutionalIdentity() {
  return useQuery<AdminInstitutionalIdentity>({
    queryKey: [ADMIN_IDENTITY_KEY],
    queryFn: () =>
      adminRequestJson<AdminInstitutionalIdentity>("/api/admin/institutional-identity"),
  });
}

export function useSaveIdentityDraft() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ content, version }: { content: InstitutionalIdentityContent; version: number }) =>
      adminRequestJson<IdentityWriteResponse>("/api/admin/institutional-identity", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, version }),
      }),
    onSuccess: () => invalidateIdentityQueries(queryClient),
  });
}

/**
 * Publicar = GUARDAR + PUBLICAR en una sola operación: se envía el contenido
 * pendiente y la versión, y el servidor persiste y publica exactamente eso.
 */
export function usePublishIdentity() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ content, version }: { content: InstitutionalIdentityContent; version: number }) =>
      adminRequestJson<IdentityWriteResponse>("/api/admin/institutional-identity/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, version }),
      }),
    onSuccess: () => invalidateIdentityQueries(queryClient),
  });
}

export function useUnpublishIdentity() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ version }: { version: number }) =>
      adminRequestJson<IdentityWriteResponse>("/api/admin/institutional-identity/unpublish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version }),
      }),
    onSuccess: () => invalidateIdentityQueries(queryClient),
  });
}

/**
 * Descarta (borra en Cloudinary) imágenes subidas y reemplazadas ANTES de guardar,
 * para no dejar huérfanos. El servidor solo borra lo que no está en uso.
 */
export function useDiscardIdentityAssets() {
  return useMutation({
    mutationFn: (publicIds: string[]) =>
      adminRequestJson<DiscardAssetsResponse>("/api/admin/institutional-identity/discard-assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publicIds }),
      }),
  });
}

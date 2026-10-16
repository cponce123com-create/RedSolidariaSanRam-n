import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminRequestJson } from "@/lib/admin-request";
import { ADMIN_IDENTITY_KEY, IDENTITY_KEY } from "@/lib/query-keys";
import { invalidateIdentityQueries } from "@/lib/query-invalidation";

/**
 * Hooks de la identidad institucional (Fase 3 del Prompt Maestro).
 *
 * Contrato único: la web pública lee `GET /api/institutional-identity` (solo el
 * contenido PUBLICADO) y el panel lee/escribe `/api/admin/institutional-identity`
 * (borrador + publicado). Ambas claves comparten la entidad `identity`, así que
 * publicar o despublicar refresca el panel Y la web con la misma invalidación.
 */

/** Tipos espejo de la API (`artifacts/api-server/src/lib/institutional-identity.ts`). */
export interface InstitutionalValue {
  title: string;
  description: string;
}

export interface InstitutionalIdentityContent {
  logo: { url: string; publicId: string | null };
  cover: {
    desktopUrl: string;
    mobileUrl: string;
    publicId: string | null;
    focus: string;
  };
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
}

export function emptyIdentityContent(): InstitutionalIdentityContent {
  return {
    logo: { url: "", publicId: null },
    cover: { desktopUrl: "", mobileUrl: "", publicId: null, focus: "50% 50%" },
    hero: { title: "", subtitle: "", ctaLabel: "", ctaHref: "" },
    story: { title: "", subtitle: "", html: "", photos: [] },
    mission: "",
    vision: "",
    values: [],
  };
}

/**
 * Identidad PUBLICADA que consume la web pública. `null` = sin publicar (la web
 * usa su contenido por defecto; nunca se rompe la página «Nosotros»).
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

/** Borrador + publicado para el panel (solo superadmin). */
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
    mutationFn: (content: InstitutionalIdentityContent) =>
      adminRequestJson("/api/admin/institutional-identity", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(content),
      }),
    onSuccess: () => invalidateIdentityQueries(queryClient),
  });
}

export function usePublishIdentity() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      adminRequestJson("/api/admin/institutional-identity/publish", { method: "POST" }),
    onSuccess: () => invalidateIdentityQueries(queryClient),
  });
}

export function useUnpublishIdentity() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      adminRequestJson("/api/admin/institutional-identity/unpublish", { method: "POST" }),
    onSuccess: () => invalidateIdentityQueries(queryClient),
  });
}

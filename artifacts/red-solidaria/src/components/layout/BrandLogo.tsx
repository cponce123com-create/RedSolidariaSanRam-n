import { useTranslation } from "react-i18next";
import { useInstitutionalIdentity } from "@/hooks/use-institutional-identity";
import { optimizeImageUrl } from "@/lib/image-url";

/**
 * Logotipo del encabezado. Si el superadmin configuró un logotipo institucional
 * (Fase 3) se muestra ese, optimizado por Cloudinary; si no, cae al logo estático
 * del bundle y, como último recurso, al corazón SVG. El encabezado nunca queda
 * vacío aunque falle una imagen.
 */
export function BrandLogo() {
  const { t } = useTranslation();
  const { data: identity } = useInstitutionalIdentity();
  const logoUrl = identity?.logo?.url
    ? optimizeImageUrl(identity.logo.url, { width: 96 })
    : "";

  return (
    <div className="relative w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
      <svg
        className="w-6 h-6 text-primary"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        aria-hidden="true"
      >
        <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
      </svg>
      <img
        src={logoUrl || `${import.meta.env.BASE_URL}images/logo.webp`}
        alt={t("nav.logoAlt")}
        className="absolute w-8 h-8 rounded-full object-cover"
        onError={(e) => {
          e.currentTarget.style.display = "none";
        }}
      />
    </div>
  );
}

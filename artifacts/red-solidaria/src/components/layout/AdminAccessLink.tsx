import { Link } from "wouter";
import { ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useGetAdminMe } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";
import { resolveAdminTarget } from "@/lib/admin-access";

/**
 * Acceso al panel de administración desde el sitio público.
 *
 * NO crea un sistema de login paralelo: reutiliza la sesión existente
 * (GET /api/admin/me). Un visitante recibe 401 → se le envía a /admin/login;
 * un administrador ya autenticado va directo al panel. Las protecciones de
 * autenticación y autorización del backend no se tocan.
 */
export function useAdminAccess() {
  const { data: adminUser, isSuccess } = useGetAdminMe({
    query: {
      queryKey: ["/api/admin/me"],
      retry: false,
      // La sesión admin cambia poco: evita repetir el 401 en cada navegación.
      staleTime: 5 * 60 * 1000,
    },
  });

  const isAuthenticated = isSuccess && !!adminUser;
  return { isAuthenticated, ...resolveAdminTarget(isAuthenticated) };
}

type AdminAccessVariant = "icon" | "menu-item";

/**
 * Enlace discreto de acceso administrativo.
 * - `icon`: solo escritorio (en móvil vive dentro del menú hamburguesa).
 * - `menu-item`: fila del menú móvil.
 */
export function AdminAccessLink({
  variant = "icon",
  onNavigate,
}: {
  variant?: AdminAccessVariant;
  onNavigate?: () => void;
}) {
  const { t } = useTranslation();
  const { href, labelKey } = useAdminAccess();
  const label = t(labelKey);

  if (variant === "menu-item") {
    return (
      <Link
        href={href}
        onClick={onNavigate}
        className={cn(
          "p-3 rounded-xl text-base font-medium flex items-center gap-2",
          "text-muted-foreground hover:bg-secondary hover:text-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
        )}
      >
        <ShieldCheck className="w-4 h-4" aria-hidden="true" />
        {label}
      </Link>
    );
  }

  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      className={cn(
        "hidden lg:inline-flex items-center justify-center h-9 w-9 rounded-full",
        "text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
      )}
    >
      <ShieldCheck className="w-5 h-5" aria-hidden="true" />
    </Link>
  );
}

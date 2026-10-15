import { Link, useLocation } from "wouter";
import { useEffect, useState } from "react";
import {
  LayoutDashboard, Target, FileText, LogOut, MessageSquare, DollarSign, Menu, X,
  AlertTriangle,
  Award, Dog, Users, Building2, Quote, HelpCircle, ShieldCheck, Settings, Sparkles,
  HandHeart, FileSpreadsheet, ClipboardList, UsersRound, BookOpen, Eraser
} from "lucide-react";
import { useAdminLogout, useGetAdminMe, type AdminUser } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { resolvePanelGate } from "@/lib/admin-session";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const logoutMutation = useAdminLogout();

  const { data: user, isError, error, isLoading, refetch } = useGetAdminMe({
    query: { queryKey: ["/api/admin/me"], retry: false }
  });

  // FE-03/FE-04: la decisión del gate es una función pura y probada
  // (`resolvePanelGate`). Solo un 401 manda al login: una caída del servidor o un
  // rol sin permiso NO se disfrazan de «sesión expirada», y ningún caso deja la
  // pantalla en blanco.
  const gate = resolvePanelGate({ isLoading, error: isError ? error : null, user });
  const redirectTo = gate.state === "unauthenticated" ? gate.redirectTo : null;

  useEffect(() => {
    if (redirectTo) setLocation(redirectTo);
  }, [redirectTo, setLocation]);

  if (gate.state === "loading") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 text-muted-foreground">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-primary" aria-hidden />
        <p className="text-sm">Cargando el panel…</p>
      </div>
    );
  }

  if (gate.state === "unauthenticated") return null;

  if (gate.state === "forbidden") {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-card border border-border rounded-2xl p-6 text-center">
          <ShieldCheck className="w-8 h-8 mx-auto text-muted-foreground mb-3" aria-hidden />
          <h1 className="font-display font-bold text-lg mb-2">Tu cuenta no tiene acceso al panel</h1>
          <p className="text-sm text-muted-foreground mb-4">
            {gate.role
              ? `El rol «${gate.role}» no puede administrar el sitio. Pide a un superadmin que revise tu cuenta.`
              : "Este rol no puede administrar el sitio. Pide a un superadmin que revise tu cuenta."}
          </p>
          <Link href="/">
            <Button variant="outline" className="rounded-xl">Volver al sitio público</Button>
          </Link>
        </div>
      </div>
    );
  }

  if (gate.state === "unavailable") {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-card border border-border rounded-2xl p-6 text-center">
          <AlertTriangle className="w-8 h-8 mx-auto text-amber-600 mb-3" aria-hidden />
          <h1 className="font-display font-bold text-lg mb-2">No se pudo comprobar tu sesión</h1>
          <p className="text-sm text-muted-foreground mb-4">
            {gate.status
              ? `El servidor respondió con un error (${gate.status}). `
              : "No hubo respuesta del servidor. "}
            Tu sesión puede seguir siendo válida; vuelve a intentarlo.
          </p>
          <Button onClick={() => void refetch()} className="rounded-xl">Reintentar</Button>
        </div>
      </div>
    );
  }

  // El gate ya garantizó que hay sesión con un rol válido: se lo decimos al
  // compilador sin cambiar el comportamiento (esta rama no se alcanza).
  if (!user) return null;
  const handleLogout = () => {
    logoutMutation.mutate(undefined, { onSuccess: () => setLocation("/admin/login") });
  };

  // El superadmin de respaldo por env var no vive en DB y usa id 0.
  const isSuperAdmin = user.role === "superadmin" || user.id === 0;
  const isModerator = user.role === "moderador";

  // Propiedades visuales/opcionales del ítem de navegación (sin index signature,
  // ya que los literales de cada grupo infieren formas distintas).
  type NavItem = { href: string; icon: React.ComponentType<{ className?: string }>; label: string } & {
    exact?: boolean; highlight?: boolean; animal?: boolean; system?: boolean;
  };

  const navGroups: { label: string; items: NavItem[] }[] = [
    {
      label: "General",
      items: [
        { href: "/admin", icon: LayoutDashboard, label: "Dashboard", exact: true },
      ],
    },
    {
      label: "Operaciones",
      items: [
        { href: "/admin/campanas", icon: Target, label: "Campañas" },
        { href: "/admin/chocofest", icon: Sparkles, label: "ChocoFest 2026" },
        ...(isModerator
          ? []
          : [
              { href: "/admin/donaciones", icon: DollarSign, label: "Donaciones" },
              { href: "/admin/donantes", icon: HandHeart, label: "Donantes" },
              { href: "/admin/auditoria", icon: ShieldCheck, label: "Auditoría" },
              { href: "/admin/libro", icon: BookOpen, label: "Libro contable" },
              { href: "/admin/certificados", icon: Award, label: "Certificados" },
              { href: "/admin/informes", icon: FileSpreadsheet, label: "Informes" },
              { href: "/admin/observaciones", icon: ClipboardList, label: "Observaciones" },
            ]),
        { href: "/admin/reportes", icon: AlertTriangle, label: "Reportes", highlight: true },
        { href: "/admin/adopciones", icon: Dog, label: "Adopciones", animal: true },
        { href: "/admin/voluntarios", icon: Users, label: "Voluntarios" },
        { href: "/admin/voluntariado/equipos", icon: UsersRound, label: "Equipos" },
        { href: "/admin/aliados", icon: Building2, label: "Aliados" },
      ],
    },
    {
      label: "Contenido",
      items: [
        { href: "/admin/noticias", icon: FileText, label: "Noticias" },
        { href: "/admin/testimonios", icon: Quote, label: "Testimonios" },
        { href: "/admin/faq", icon: HelpCircle, label: "FAQ" },
        { href: "/admin/mensajes", icon: MessageSquare, label: "Mensajes" },
      ],
    },
    ...(isSuperAdmin ? [{
      label: "Sistema",
      items: [
        { href: "/admin/mantenimiento/gastos", icon: Eraser, label: "Gastos DEMO", system: true },
        { href: "/admin/usuarios", icon: ShieldCheck, label: "Usuarios", system: true },
        { href: "/admin/configuracion", icon: Settings, label: "Configuración", system: true },
      ],
    }] : []),
  ];

  const renderNav = (onNavigate?: () => void) => (
    <nav className="flex-1 p-3 space-y-4">
      {navGroups.map(group => (
        <div key={group.label}>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-3 mb-1.5">{group.label}</p>
          <div className="space-y-0.5">
            {group.items.map((item) => {
              const isActive = item.exact ? location === item.href || location === "" : location.startsWith(item.href);
              return (
                <Link key={item.href} href={item.href} onClick={onNavigate}>
                  <span className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors cursor-pointer ${
                    isActive
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : item.highlight && !isActive
                      ? "text-orange-700 hover:bg-orange-50 hover:text-orange-800"
                      : item.animal && !isActive
                      ? "text-amber-700 hover:bg-amber-50 hover:text-amber-800"
                      : item.system && !isActive
                      ? "text-purple-700 hover:bg-purple-50 hover:text-purple-800"
                      : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                  }`}>
                    <item.icon className="w-4 h-4 shrink-0" />
                    {item.label}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen bg-secondary/30">
      {/* Barra superior móvil */}
      <header className="md:hidden sticky top-0 z-30 bg-card border-b border-border flex items-center justify-between px-4 h-14">
        <Link href="/admin">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-white font-bold shrink-0">R</div>
            <span className="font-bold font-display text-sm">Red Solidaria</span>
          </div>
        </Link>
        <Button variant="ghost" size="icon" onClick={() => setMobileNavOpen(true)} aria-label="Abrir menú de administración">
          <Menu className="w-5 h-5" />
        </Button>
      </header>

      {/* Drawer móvil */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileNavOpen(false)} aria-hidden="true" />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-card shadow-xl flex flex-col">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <Link href="/admin" onClick={() => setMobileNavOpen(false)}>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-white font-bold shrink-0">R</div>
                  <span className="font-bold font-display text-sm">Red Solidaria</span>
                </div>
              </Link>
              <Button variant="ghost" size="icon" onClick={() => setMobileNavOpen(false)} aria-label="Cerrar menú">
                <X className="w-5 h-5" />
              </Button>
            </div>
            {renderNav(() => setMobileNavOpen(false))}
            <div className="p-4 border-t border-border">
              <div className="mb-3 px-3">
                <p className="text-sm font-semibold text-foreground">{user.name || user.username}</p>
                <p className="text-xs text-muted-foreground capitalize">{user.role || "admin"}</p>
              </div>
              <Button variant="ghost" className="w-full justify-start text-destructive hover:text-destructive hover:bg-destructive/10 rounded-xl h-10 text-sm" onClick={handleLogout}>
                <LogOut className="w-4 h-4 mr-3" /> Cerrar Sesión
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Sidebar escritorio */}
      <aside className="hidden md:flex w-64 bg-card border-r border-border flex-col fixed inset-y-0 z-20 shadow-lg shadow-black/5 overflow-y-auto">
        <Link href="/admin">
          <div className="p-5 border-b border-border flex items-center gap-3 hover:bg-secondary/30 transition-colors cursor-pointer">
            <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-white font-bold shrink-0">R</div>
            <div>
              <span className="font-bold font-display text-sm block leading-tight">Red Solidaria</span>
              <span className="text-xs text-muted-foreground">Admin Panel</span>
            </div>
          </div>
        </Link>
        {renderNav()}
        <div className="p-4 border-t border-border">
          <div className="mb-3 px-3">
            <p className="text-sm font-semibold text-foreground">{user.name || user.username}</p>
            <p className="text-xs text-muted-foreground capitalize">{user.role || "admin"}</p>
          </div>
          <Button variant="ghost" className="w-full justify-start text-destructive hover:text-destructive hover:bg-destructive/10 rounded-xl h-10 text-sm" onClick={handleLogout}>
            <LogOut className="w-4 h-4 mr-3" /> Cerrar Sesión
          </Button>
        </div>
      </aside>

      <main className="md:ml-64 min-h-screen pt-14 md:pt-0">
        {children}
      </main>
    </div>
  );
}

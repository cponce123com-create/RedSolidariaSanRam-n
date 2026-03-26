import { Link, useLocation } from "wouter";
import { useEffect } from "react";
import {
  LayoutDashboard, Target, FileText, LogOut, MessageSquare, DollarSign,
  AlertTriangle, Dog, Users, Building2, Quote, HelpCircle, ShieldCheck
} from "lucide-react";
import { useAdminLogout, useGetAdminMe } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const logoutMutation = useAdminLogout();
  
  const { data: user, isError, isLoading } = useGetAdminMe({
    query: { retry: false }
  });

  useEffect(() => {
    if (isError) setLocation("/admin/login");
  }, [isError, setLocation]);

  if (isLoading) return <div className="min-h-screen flex items-center justify-center">Cargando...</div>;
  if (isError || !user) return null;

  const handleLogout = () => {
    logoutMutation.mutate(undefined, { onSuccess: () => setLocation("/admin/login") });
  };

  const isSuperAdmin = (user as any).role === "superadmin" || (user as any).id === 0;

  const navGroups = [
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
        { href: "/admin/donaciones", icon: DollarSign, label: "Donaciones" },
        { href: "/admin/reportes", icon: AlertTriangle, label: "Reportes", highlight: true },
        { href: "/admin/adopciones", icon: Dog, label: "Adopciones", animal: true },
        { href: "/admin/voluntarios", icon: Users, label: "Voluntarios" },
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
        { href: "/admin/usuarios", icon: ShieldCheck, label: "Usuarios", system: true },
      ],
    }] : []),
  ];

  return (
    <div className="min-h-screen bg-secondary/30 flex">
      <aside className="w-64 bg-card border-r border-border flex flex-col fixed inset-y-0 shadow-lg shadow-black/5 z-20 overflow-y-auto">
        <Link href="/admin">
          <div className="p-5 border-b border-border flex items-center gap-3 hover:bg-secondary/30 transition-colors cursor-pointer">
            <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-white font-bold shrink-0">R</div>
            <div>
              <span className="font-bold font-display text-sm block leading-tight">Red Solidaria</span>
              <span className="text-xs text-muted-foreground">Admin Panel</span>
            </div>
          </div>
        </Link>
        
        <nav className="flex-1 p-3 space-y-4">
          {navGroups.map(group => (
            <div key={group.label}>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-3 mb-1.5">{group.label}</p>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const isActive = (item as any).exact ? location === item.href || location === "" : location.startsWith(item.href);
                  return (
                    <Link key={item.href} href={item.href}>
                      <span className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors cursor-pointer ${
                        isActive
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : (item as any).highlight && !isActive
                          ? "text-red-600 hover:bg-red-50 hover:text-red-700"
                          : (item as any).animal && !isActive
                          ? "text-amber-700 hover:bg-amber-50 hover:text-amber-800"
                          : (item as any).system && !isActive
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

        <div className="p-4 border-t border-border">
          <div className="mb-3 px-3">
            <p className="text-sm font-semibold text-foreground">{(user as any).name || user?.username}</p>
            <p className="text-xs text-muted-foreground capitalize">{(user as any).role || "admin"}</p>
          </div>
          <Button variant="ghost" className="w-full justify-start text-destructive hover:text-destructive hover:bg-destructive/10 rounded-xl h-10 text-sm" onClick={handleLogout}>
            <LogOut className="w-4 h-4 mr-3" /> Cerrar Sesión
          </Button>
        </div>
      </aside>

      <main className="flex-1 ml-64 min-h-screen">
        {children}
      </main>
    </div>
  );
}

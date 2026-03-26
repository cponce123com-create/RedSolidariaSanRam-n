import { Link, useLocation } from "wouter";
import { useEffect } from "react";
import { Target, FileText, LogOut, MessageSquare, DollarSign, AlertTriangle } from "lucide-react";
import { useAdminLogout, useGetAdminMe } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const logoutMutation = useAdminLogout();
  
  const { data: user, isError, isLoading } = useGetAdminMe({
    query: { retry: false }
  });

  useEffect(() => {
    if (isError) {
      setLocation("/admin/login");
    }
  }, [isError, setLocation]);

  if (isLoading) return <div className="min-h-screen flex items-center justify-center">Cargando...</div>;
  
  if (isError || !user) return null;

  const handleLogout = () => {
    logoutMutation.mutate(undefined, {
      onSuccess: () => setLocation("/admin/login")
    });
  };

  const navItems = [
    { href: "/admin/campanas", icon: Target, label: "Campañas" },
    { href: "/admin/donaciones", icon: DollarSign, label: "Donaciones" },
    { href: "/admin/reportes", icon: AlertTriangle, label: "Reportes", highlight: true },
    { href: "/admin/noticias", icon: FileText, label: "Noticias" },
    { href: "/admin/mensajes", icon: MessageSquare, label: "Mensajes" },
  ];

  return (
    <div className="min-h-screen bg-secondary/30 flex">
      <aside className="w-64 bg-card border-r border-border flex flex-col fixed inset-y-0 shadow-lg shadow-black/5 z-20">
        <div className="p-6 border-b border-border flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-white font-bold">R</div>
          <span className="font-bold font-display leading-tight">RedSolidaria<br/><span className="text-xs text-muted-foreground font-normal">Admin Panel</span></span>
        </div>
        
        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => {
            const isActive = location.startsWith(item.href);
            return (
              <Link key={item.href} href={item.href}>
                <span className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors cursor-pointer ${
                  isActive
                    ? "bg-primary text-primary-foreground shadow-md"
                    : (item as any).highlight && !isActive
                    ? "text-red-600 hover:bg-red-50 hover:text-red-700"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                }`}>
                  <item.icon className="w-5 h-5" />
                  {item.label}
                </span>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-border">
          <div className="mb-4 px-4 text-sm font-medium text-foreground">Hola, {user?.username}</div>
          <Button variant="ghost" className="w-full justify-start text-destructive hover:text-destructive hover:bg-destructive/10 rounded-xl h-11" onClick={handleLogout}>
            <LogOut className="w-5 h-5 mr-3" /> Cerrar Sesión
          </Button>
        </div>
      </aside>

      <main className="flex-1 ml-64 min-h-screen">
        {children}
      </main>
    </div>
  );
}

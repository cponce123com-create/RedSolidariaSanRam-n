import { Link, useLocation } from "wouter";
import { Home, Heart, BookOpen, PawPrint, Phone, HeartHandshake } from "lucide-react";

const navItems = [
  { href: "/", label: "Inicio", icon: Home },
  { href: "/campanas", label: "Campañas", icon: Heart },
  { href: "/noticias", label: "Noticias", icon: BookOpen },
  { href: "/adopciones", label: "Adopciones", icon: PawPrint },
  { href: "/contacto", label: "Contacto", icon: Phone },
  { href: "/campanas", label: "Donar", icon: HeartHandshake, donar: true },
];

export default function MobileBottomNav() {
  const [location] = useLocation();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-card border-t border-gray-100 shadow-lg md:hidden safe-area-pb">
      <div className="flex">
        {navItems.map(({ href, label, icon: Icon, donar }) => {
          const isActive = href === "/" ? location === "/" : location.startsWith(href);
          return (
            <Link
              key={href + label}
              href={href}
              className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-[10px] font-medium transition-colors ${
                donar
                  ? "bg-primary text-white rounded-full mx-2 my-1 shadow-lg shadow-primary/25"
                  : isActive
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon
                className={`w-5 h-5 ${isActive && !donar ? "stroke-[2.5]" : "stroke-[1.5]"}`}
              />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

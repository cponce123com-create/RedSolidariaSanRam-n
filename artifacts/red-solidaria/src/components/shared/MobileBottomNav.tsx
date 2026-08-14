import { Link, useLocation } from "wouter";
import { Home, Heart, BookOpen, PawPrint, Phone } from "lucide-react";
import { useTranslation } from "react-i18next";

export default function MobileBottomNav() {
  const [location] = useLocation();
  const { t } = useTranslation();

  // 5 items: el CTA "Donar" ya vive en el header (siempre visible en móvil).
  // El sexto item duplicaba la ruta /campanas y robaba ancho en 320px.
  const navItems = [
    { href: "/", label: t("mobileNav.home"), icon: Home },
    { href: "/campanas", label: t("mobileNav.campaigns"), icon: Heart },
    { href: "/noticias", label: t("mobileNav.news"), icon: BookOpen },
    { href: "/adopciones", label: t("mobileNav.adoptions"), icon: PawPrint },
    { href: "/contacto", label: t("mobileNav.contact"), icon: Phone },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-card border-t border-gray-100 shadow-lg md:hidden safe-area-pb">
      <div className="flex">
        {navItems.map(({ href, label, icon: Icon }) => {
          const isActive = href === "/" ? location === "/" : location.startsWith(href);
          return (
            <Link
              key={href + label}
              href={href}
              aria-current={isActive ? "page" : undefined}
              className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 min-h-[52px] text-[11px] font-medium transition-colors ${
                isActive
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground active:text-primary"
              }`}
            >
              <Icon
                className={`w-5 h-5 ${isActive ? "stroke-[2.5]" : "stroke-[1.5]"}`}
              />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

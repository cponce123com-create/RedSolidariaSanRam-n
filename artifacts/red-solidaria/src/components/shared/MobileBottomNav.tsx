import { Link, useLocation } from "wouter";
import { Home, Heart, BookOpen, PawPrint, Phone, HeartHandshake } from "lucide-react";
import { useTranslation } from "react-i18next";

export default function MobileBottomNav() {
  const [location] = useLocation();
  const { t } = useTranslation();

  const navItems = [
    { href: "/", label: t("mobileNav.home"), icon: Home },
    { href: "/campanas", label: t("mobileNav.campaigns"), icon: Heart },
    { href: "/noticias", label: t("mobileNav.news"), icon: BookOpen },
    { href: "/adopciones", label: t("mobileNav.adoptions"), icon: PawPrint },
    { href: "/contacto", label: t("mobileNav.contact"), icon: Phone },
    { href: "/campanas", label: t("mobileNav.donate"), icon: HeartHandshake, donar: true },
  ];

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

import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle,
  Dog,
  Heart,
  Menu,
  Moon,
  Package,
  Sun,
  X,
  ChevronDown,
  HandHeart,
  LifeBuoy,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";
import { useTheme } from "@/hooks/use-theme";
import { LanguageSwitcher } from "@/components/shared/LanguageSwitcher";
import { cn } from "@/lib/utils";

type NavLinkItem = {
  href: string;
  labelKey: string;
  icon?: LucideIcon;
  urgent?: boolean;
  animal?: boolean;
};

// Enlaces directos del navbar (desktop): las dos vías + núcleo de la red.
const DIRECT_LINKS: NavLinkItem[] = [
  { href: "/", labelKey: "nav.home" },
  { href: "/reportar", labelKey: "nav.needHelp" },
  { href: "/campanas", labelKey: "nav.campaigns" },
  { href: "/adopciones", labelKey: "nav.adoptions", animal: true },
  { href: "/transparencia", labelKey: "nav.transparency" },
];

const MORE_LINKS: NavLinkItem[] = [
  { href: "/nosotros", labelKey: "nav.about" },
  { href: "/casos-urgentes", labelKey: "nav.urgentCases", urgent: true },
  { href: "/como-ayudar", labelKey: "nav.howToHelp" },
  { href: "/voluntariado", labelKey: "footer.volunteer" },
  { href: "/catalogo", labelKey: "nav.catalog", icon: Package },
  { href: "/ayuda-animal", labelKey: "nav.animalWelfare", animal: true },
  { href: "/contacto", labelKey: "nav.contact" },
];

// Todos los enlaces (menú móvil completo).
const ALL_LINKS = [...DIRECT_LINKS, ...MORE_LINKS];

function isActive(location: string, href: string) {
  return href === "/" ? location === "/" : location.startsWith(href + "/") || location === href;
}

/** Desplegable "Más" del navbar: agrupa los enlaces secundarios. */
function MoreDropdown({ location }: { location: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Cierra al hacer click fuera
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const hasActive = MORE_LINKS.some((link) => isActive(location, link.href));

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        className={cn(
          "px-3 py-2 rounded-full text-sm font-medium transition-all flex items-center gap-1",
          hasActive
            ? "text-primary bg-primary/5 font-semibold"
            : "text-muted-foreground hover:bg-secondary hover:text-foreground"
        )}
      >
        {t("nav.more")}
        <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="absolute right-0 top-full mt-2 w-64 rounded-2xl bg-card border border-border shadow-xl shadow-primary/10 p-2 z-50 origin-top-right"
          >
            {MORE_LINKS.map((link) => {
              const Icon = link.icon;
              const active = isActive(location, link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  role="menuitem"
                  onClick={() => setOpen(false)}
                  className={cn(
                    "flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors",
                    link.urgent
                      ? "text-orange-700 hover:bg-orange-50"
                      : link.animal
                        ? "text-amber-700 hover:bg-amber-50"
                        : active
                          ? "text-primary bg-primary/5"
                          : "text-foreground hover:bg-secondary"
                  )}
                >
                  {link.urgent && <AlertTriangle className="w-4 h-4 text-orange-500 shrink-0" />}
                  {link.animal && <Dog className="w-4 h-4 text-amber-500 shrink-0" />}
                  {Icon && <Icon className="w-4 h-4 shrink-0" />}
                  {t(link.labelKey)}
                </Link>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function Navbar() {
  const [location] = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { theme, toggleTheme } = useTheme();
  const { t } = useTranslation();

  // Compacta el header al hacer scroll (sticky no invasivo).
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className="fixed top-0 left-0 right-0 z-50 glass-nav transition-shadow duration-300">
      <div className={cn("mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 transition-all duration-300", scrolled ? "h-16" : "h-20")}>
        <div className="flex justify-between items-center h-full">
          {/* Logo + marca */}
          <Link href="/" className="flex items-center gap-3 group" aria-label={t("nav.brand")}>
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
              <img
                src={`${import.meta.env.BASE_URL}images/logo.webp`}
                alt={t("nav.logoAlt")}
                className="w-8 h-8 rounded-full object-cover"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                  e.currentTarget.parentElement!.innerHTML = '<svg class="w-6 h-6 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>';
                }}
              />
            </div>
            <span className="hidden sm:flex flex-col leading-none">
              <span className="font-display font-bold text-base text-foreground tracking-[0.14em]">
                {t("nav.brand").toUpperCase()}
              </span>
              <span className="mt-0.5 text-[11px] font-medium uppercase tracking-[0.28em] text-primary">
                {t("nav.brandLocation").toUpperCase()}
              </span>
            </span>
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden lg:flex items-center gap-0.5" aria-label={t("common.skipToContent")}>
            {DIRECT_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "px-3 py-2 rounded-full text-sm font-medium transition-all",
                  isActive(location, link.href)
                    ? "text-primary bg-primary/5 font-semibold"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                )}
              >
                {t(link.labelKey)}
              </Link>
            ))}
            <MoreDropdown location={location} />
          </nav>

          {/* Actions */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Idioma — solo ≥sm: en móvil vive dentro del menú hamburguesa */}
            <div className="hidden sm:block">
              <LanguageSwitcher />
            </div>

            {/* Toggle claro/oscuro */}
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              aria-label={theme === "dark" ? t("nav.lightMode") : t("nav.darkMode")}
              className="rounded-full text-muted-foreground hover:text-foreground hover:bg-secondary"
            >
              {theme === "dark" ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </Button>

            {/* Quiero ayudar */}
            <Link href="/como-ayudar" className="hidden xl:block">
              <Button
                variant="outline"
                className="rounded-full gap-2 font-semibold text-primary border-primary/30 hover:border-primary/60 hover:bg-secondary/60 text-sm px-4 h-9"
              >
                <HandHeart className="w-4 h-4" />
                {t("nav.wantToHelp")}
              </Button>
            </Link>

            {/* DONAR — siempre visible (también en móvil) */}
            <Link href="/campanas">
              <Button className="rounded-full gap-2 font-semibold shadow-lg shadow-primary/25 hover-elevate text-sm px-3 sm:px-4 h-9">
                <Heart className="w-4 h-4" />
                {t("nav.donate")}
              </Button>
            </Link>

            {/* Mobile Menu Toggle */}
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              aria-label={isMobileMenuOpen ? t("nav.closeMenu") : t("nav.openMenu")}
              aria-expanded={isMobileMenuOpen}
            >
              {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </Button>
          </div>
        </div>
      </div>

      {/* Mobile Nav */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="lg:hidden bg-background border-b border-border"
          >
            <nav className="flex flex-col p-4 gap-1" aria-label={t("nav.openMenu")}>
              {/* Vía principal móvil */}
              <div className="mb-1 grid grid-cols-2 gap-2">
                <Link href="/reportar" onClick={() => setIsMobileMenuOpen(false)}>
                  <Button variant="outline" className="w-full rounded-xl gap-2 font-semibold border-primary/30 text-primary hover:bg-secondary/60">
                    <LifeBuoy className="w-4 h-4" />
                    {t("nav.needHelp")}
                  </Button>
                </Link>
                <Link href="/como-ayudar" onClick={() => setIsMobileMenuOpen(false)}>
                  <Button variant="outline" className="w-full rounded-xl gap-2 font-semibold border-primary/30 text-primary hover:bg-secondary/60">
                    <HandHeart className="w-4 h-4" />
                    {t("nav.wantToHelp")}
                  </Button>
                </Link>
              </div>

              {ALL_LINKS.filter((l) => l.href !== "/reportar" && l.href !== "/como-ayudar").map((link) => {
                const Icon = link.icon;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={cn(
                      "p-3 rounded-xl text-base font-medium flex items-center gap-2",
                      isActive(location, link.href)
                        ? "bg-primary/10 text-primary"
                        : link.urgent
                          ? "text-orange-700 hover:bg-orange-50"
                          : link.animal
                            ? "text-amber-700 hover:bg-amber-50"
                            : "text-foreground hover:bg-secondary"
                    )}
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    {link.urgent && <AlertTriangle className="w-4 h-4 text-orange-500" />}
                    {link.animal && <Dog className="w-4 h-4 text-amber-500" />}
                    {Icon && <Icon className="w-4 h-4" />}
                    {t(link.labelKey)}
                  </Link>
                );
              })}

              <div className="border-t border-border mt-2 pt-2 space-y-2">
                <Link href="/campanas" onClick={() => setIsMobileMenuOpen(false)}>
                  <Button className="w-full rounded-xl gap-2 font-semibold">
                    <Heart className="w-4 h-4" />
                    {t("nav.donateNow")}
                  </Button>
                </Link>
                <div className="flex justify-center pt-1">
                  <LanguageSwitcher />
                </div>
              </div>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}

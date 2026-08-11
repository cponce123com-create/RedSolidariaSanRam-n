import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Menu, Heart, X, AlertTriangle, Dog, Package, Sun, Moon } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";
import { useTheme } from "@/hooks/use-theme";
import { LanguageSwitcher } from "@/components/shared/LanguageSwitcher";

type NavLinkItem = {
  href: string;
  labelKey: string;
  icon?: LucideIcon;
  urgent?: boolean;
  animal?: boolean;
};

export function Navbar() {
  const [location] = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { theme, toggleTheme } = useTheme();
  const { t } = useTranslation();

  const navLinks: NavLinkItem[] = [
    { href: "/", labelKey: "nav.home" },
    { href: "/nosotros", labelKey: "nav.about" },
    { href: "/campanas", labelKey: "nav.campaigns" },
    { href: "/transparencia", labelKey: "nav.transparency" },
    { href: "/casos-urgentes", labelKey: "nav.urgentCases", urgent: true },
    { href: "/como-ayudar", labelKey: "nav.howToHelp" },
    { href: "/catalogo", labelKey: "nav.catalog", icon: Package },
    { href: "/adopciones", labelKey: "nav.adoptions", animal: true },
    { href: "/ayuda-animal", labelKey: "nav.animalWelfare", animal: true },
    { href: "/contacto", labelKey: "nav.contact" },
  ];

  return (
    <header className="fixed top-0 left-0 right-0 z-50 glass-nav">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-20">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3 group">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
              <img
                src={`${import.meta.env.BASE_URL}images/logo.webp`}
                alt={t("nav.logoAlt")}
                className="w-8 h-8 rounded-full object-cover"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                  e.currentTarget.parentElement!.innerHTML = '<svg class="w-6 h-6 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>';
                }}
              />
            </div>
            <span className="font-display font-bold text-xl text-foreground hidden sm:block">
              {t("nav.brand")} <span className="text-primary">{t("nav.brandLocation")}</span>
            </span>
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden lg:flex items-center gap-1">
            {navLinks.map((link) => {
              const Icon = link.icon;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`px-3 py-2 rounded-full text-sm font-medium transition-all ${
                    link.urgent
                      ? location === link.href || location.startsWith(link.href + "/")
                        ? "text-orange-700 bg-orange-100 font-semibold"
                        : "text-orange-700 hover:bg-orange-50 font-semibold flex items-center gap-1"
                      : link.animal
                      ? location === link.href || location.startsWith(link.href + "/")
                        ? "text-amber-700 bg-amber-100 font-semibold"
                        : "text-amber-700 hover:bg-amber-50 font-medium flex items-center gap-1"
                      : location === link.href || (link.href !== "/" && location.startsWith(link.href + "/"))
                      ? "text-primary bg-primary/5"
                      : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                  }`}
                >
                  {link.urgent && <AlertTriangle className="w-3.5 h-3.5 inline mr-0.5" />}
                  {link.animal && <Dog className="w-3.5 h-3.5 inline mr-0.5" />}
                  {Icon && <Icon className="w-3.5 h-3.5 inline mr-0.5" />}
                  {t(link.labelKey)}
                </Link>
              );
            })}
          </nav>

          {/* Actions */}
          <div className="flex items-center gap-3">
            {/* Idioma */}
            <LanguageSwitcher />

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

            <Link href="/campanas">
              <Button className="hidden sm:flex rounded-full gap-2 font-semibold shadow-lg shadow-primary/25 hover-elevate text-sm px-4 h-9">
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
            <nav className="flex flex-col p-4 gap-1">
              {navLinks.map((link) => {
                const Icon = link.icon;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`p-3 rounded-xl text-base font-medium flex items-center gap-2 ${
                      location === link.href ? "bg-primary/10 text-primary" :
                      link.urgent ? "text-orange-700 hover:bg-orange-50" :
                      link.animal ? "text-amber-700 hover:bg-amber-50" :
                      "text-foreground hover:bg-secondary"
                    }`}
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
                <Link href="/reportar" onClick={() => setIsMobileMenuOpen(false)}>
                  <Button variant="outline" className="w-full rounded-xl gap-2 font-semibold border-orange-300 text-orange-700 hover:bg-orange-50">
                    <AlertTriangle className="w-4 h-4" />
                    {t("nav.reportCase")}
                  </Button>
                </Link>
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

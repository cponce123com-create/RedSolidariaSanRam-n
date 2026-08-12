import { Link } from "wouter";
import { Heart, Mail, MapPin, Phone } from "lucide-react";
import { useTranslation } from "react-i18next";

// Iconos sociales inline: lucide eliminó los iconos de marca en v1.x
// (Facebook/Instagram ya no se exportan). Mismos trazos que lucide 0.545.0
// para paridad visual exacta; no dependen de ninguna versión de lucide.
function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
    </svg>
  );
}

function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
    </svg>
  );
}

export function Footer() {
  const { t } = useTranslation();

  return (
    <footer className="bg-card border-t border-border/50 pt-14 pb-6">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-2 lg:grid-cols-12 mb-10">
          {/* Marca + descripción + redes */}
          <div className="space-y-4 lg:col-span-4">
            <Link href="/" className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center">
                <Heart className="w-4.5 h-4.5 text-white" />
              </div>
              <span className="flex flex-col leading-none">
                <span className="font-display font-bold text-lg text-foreground tracking-[0.12em]">
                  {t("footer.brand").toUpperCase()}
                </span>
                <span className="mt-0.5 text-[11px] font-medium uppercase tracking-[0.24em] text-primary">
                  {t("nav.brandLocation").toUpperCase()}
                </span>
              </span>
            </Link>
            <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
              {t("footer.tagline")}
            </p>
            <div className="flex gap-3">
              <a
                href="https://facebook.com/redsolidariasanramon"
                target="_blank"
                rel="noopener noreferrer"
                aria-label={t("footer.facebookAria")}
                className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center text-foreground hover:bg-primary hover:text-white transition-colors"
              >
                <FacebookIcon className="w-4.5 h-4.5" />
              </a>
              <a
                href="https://instagram.com/redsolidariasanramon"
                target="_blank"
                rel="noopener noreferrer"
                aria-label={t("footer.instagramAria")}
                className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center text-foreground hover:bg-primary hover:text-white transition-colors"
              >
                <InstagramIcon className="w-4.5 h-4.5" />
              </a>
            </div>
          </div>

          {/* Navegación */}
          <nav className="lg:col-span-2" aria-label={t("footer.quickLinks")}>
            <h3 className="font-display font-bold text-base mb-4 text-foreground">
              {t("footer.quickLinks")}
            </h3>
            <ul className="space-y-2.5 text-sm">
              <li><Link href="/" className="text-muted-foreground hover:text-primary transition-colors">{t("nav.home")}</Link></li>
              <li><Link href="/nosotros" className="text-muted-foreground hover:text-primary transition-colors">{t("footer.aboutUs")}</Link></li>
              <li><Link href="/casos-urgentes" className="text-muted-foreground hover:text-primary transition-colors">{t("nav.urgentCases")}</Link></li>
              <li><Link href="/como-ayudar" className="text-muted-foreground hover:text-primary transition-colors">{t("nav.howToHelp")}</Link></li>
              <li><Link href="/noticias" className="text-muted-foreground hover:text-primary transition-colors">{t("footer.newsBlog")}</Link></li>
            </ul>
          </nav>

          {/* Campañas / acciones */}
          <nav className="lg:col-span-3" aria-label={t("nav.campaigns")}>
            <h3 className="font-display font-bold text-base mb-4 text-foreground">
              {t("nav.campaigns")}
            </h3>
            <ul className="space-y-2.5 text-sm">
              <li><Link href="/campanas" className="text-muted-foreground hover:text-primary transition-colors">{t("footer.activeCampaigns")}</Link></li>
              <li><Link href="/adopciones" className="text-muted-foreground hover:text-primary transition-colors">{t("nav.adoptions")}</Link></li>
              <li><Link href="/voluntariado" className="text-muted-foreground hover:text-primary transition-colors">{t("footer.volunteer")}</Link></li>
              <li><Link href="/reportar" className="text-muted-foreground hover:text-primary transition-colors">{t("nav.reportCase")}</Link></li>
            </ul>
          </nav>

          {/* Transparencia + contacto */}
          <div className="lg:col-span-3">
            <h3 className="font-display font-bold text-base mb-4 text-foreground">
              {t("footer.transparencyTitle")}
            </h3>
            <p className="text-sm leading-relaxed text-muted-foreground mb-3">
              {t("footer.transparencyText")}
            </p>
            <Link href="/transparencia" className="inline-block text-sm font-semibold text-primary hover:underline">
              {t("footer.seeReport")} →
            </Link>

            <ul className="mt-5 space-y-2.5 text-sm text-muted-foreground">
              <li className="flex items-start gap-2.5">
                <MapPin className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                <span>
                  {t("footer.address")} · {t("footer.country")}
                </span>
              </li>
              <li className="flex items-center gap-2.5">
                <Phone className="w-4 h-4 text-primary shrink-0" />
                <a href="tel:+51921615737" className="hover:text-primary transition-colors">+51 921 615 737</a>
              </li>
              <li className="flex items-center gap-2.5">
                <Mail className="w-4 h-4 text-primary shrink-0" />
                <a href="mailto:contacto@redsolidariasanramon.org" className="hover:text-primary transition-colors">
                  contacto@redsolidariasanramon.org
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Barra inferior */}
        <div className="pt-6 border-t border-border/50 flex flex-col md:flex-row justify-between items-center gap-3">
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} {t("footer.brand")} · {t("footer.address")}. {t("footer.rights")}
          </p>
          <div className="flex gap-4 text-xs text-muted-foreground">
            <Link href="/contacto" className="hover:text-primary transition-colors">{t("nav.contact")}</Link>
            <Link href="/admin/login" className="hover:text-primary transition-colors">{t("footer.adminPortal")}</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}

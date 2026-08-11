import { Link } from "wouter";
import { Heart, Mail, MapPin, Phone, Facebook, Instagram } from "lucide-react";
import { useTranslation } from "react-i18next";

export function Footer() {
  const { t } = useTranslation();

  return (
    <footer className="bg-card border-t border-border/50 pt-16 pb-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 mb-12">
          
          <div className="space-y-4">
            <Link href="/" className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
                <Heart className="w-4 h-4 text-white" />
              </div>
              <span className="font-display font-bold text-xl">{t("footer.brand")}</span>
            </Link>
            <p className="text-muted-foreground leading-relaxed">
              {t("footer.tagline")}
            </p>
            <div className="flex gap-4">
              <a href="https://facebook.com/redsolidariasanramon" target="_blank" rel="noopener noreferrer" aria-label={t("footer.facebookAria")} className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center text-foreground hover:bg-primary hover:text-white transition-colors">
                <Facebook className="w-5 h-5" />
              </a>
              <a href="https://instagram.com/redsolidariasanramon" target="_blank" rel="noopener noreferrer" aria-label={t("footer.instagramAria")} className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center text-foreground hover:bg-primary hover:text-white transition-colors">
                <Instagram className="w-5 h-5" />
              </a>
            </div>
          </div>

          <div>
            <h3 className="font-display font-bold text-lg mb-6">{t("footer.quickLinks")}</h3>
            <ul className="space-y-3">
              <li><Link href="/nosotros" className="text-muted-foreground hover:text-primary transition-colors">{t("footer.aboutUs")}</Link></li>
              <li><Link href="/campanas" className="text-muted-foreground hover:text-primary transition-colors">{t("footer.activeCampaigns")}</Link></li>
              <li><Link href="/noticias" className="text-muted-foreground hover:text-primary transition-colors">{t("footer.newsBlog")}</Link></li>
              <li><Link href="/contacto" className="text-muted-foreground hover:text-primary transition-colors">{t("footer.volunteer")}</Link></li>
            </ul>
          </div>

          <div>
            <h3 className="font-display font-bold text-lg mb-6">{t("footer.contactTitle")}</h3>
            <ul className="space-y-4">
              <li className="flex items-start gap-3 text-muted-foreground">
                <MapPin className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <span>{t("footer.address")}<br/>{t("footer.country")}</span>
              </li>
              <li className="flex items-center gap-3 text-muted-foreground">
                <Phone className="w-5 h-5 text-primary shrink-0" />
                <span>+51 921 615 737</span>
              </li>
              <li className="flex items-center gap-3 text-muted-foreground">
                <Mail className="w-5 h-5 text-primary shrink-0" />
                <span>contacto@redsolidariasanramon.org</span>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="font-display font-bold text-lg mb-6">{t("footer.transparencyTitle")}</h3>
            <p className="text-muted-foreground mb-4">
              {t("footer.transparencyText")}
            </p>
            <Link href="/transparencia">
              <span className="text-primary font-medium hover:underline flex items-center gap-1">
                {t("footer.seeReport")} <span aria-hidden="true">&rarr;</span>
              </span>
            </Link>
          </div>

        </div>

        <div className="pt-8 border-t border-border/50 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} {t("footer.brand")} {t("footer.address")}. {t("footer.rights")}
          </p>
          <div className="flex gap-4 text-sm text-muted-foreground">
            <Link href="/admin/login" className="hover:text-primary transition-colors">{t("footer.adminPortal")}</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}

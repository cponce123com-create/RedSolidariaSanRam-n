import { motion } from "framer-motion";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { HeartHandshake, Package, PawPrint, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { SectionContainer, SectionHeading } from "./SectionHeading";
import { useCmsPage } from "@/hooks/use-cms-page";
import { cmsItems, cmsText, resolveLocale, resolveText } from "@/lib/cms";

interface HelpOption {
  icon: LucideIcon;
  labelKey: string;
  descKey: string;
  href: string;
}

/** Contenido por defecto (i18n). El CMS lo superpone si hay algo publicado. */
const OPTIONS: HelpOption[] = [
  { icon: HeartHandshake, labelKey: "home.helpDonate", descKey: "home.helpDonateDesc", href: "/campanas" },
  { icon: Package, labelKey: "home.helpProducts", descKey: "home.helpProductsDesc2", href: "/como-ayudar" },
  { icon: Users, labelKey: "home.helpVolunteerTitle2", descKey: "home.helpVolunteerDesc2", href: "/voluntariado" },
  { icon: PawPrint, labelKey: "home.helpAnimalTitle2", descKey: "home.helpAnimalDesc2", href: "/adopciones" },
];

/**
 * "¿Cómo puedes ayudar?" — 4 caminos de acción claros y minimalistas. Los textos y los
 * enlaces son administrables (página «Inicio» → bloque «Formas de ayudar»); los iconos
 * se conservan por posición.
 */
export function HowToHelpSection() {
  const { t, i18n } = useTranslation();
  const locale = resolveLocale(i18n.language);
  const { data: cms } = useCmsPage("inicio");

  const heading = cmsText(cms, "help", "heading", locale, t("home.helpSectionTitle"));
  const subtitle = cmsText(cms, "help", "subtitle", locale, t("home.helpSectionSubtitle"));

  const cmsItemsList = cmsItems(cms, "help", "items").filter(
    (item) => resolveText(item.title, locale) || resolveText(item.description, locale),
  );

  const items = cmsItemsList.length
    ? cmsItemsList.map((item, index) => ({
        key: `cms-${index}`,
        icon: OPTIONS[index % OPTIONS.length].icon,
        label: resolveText(item.title, locale),
        description: resolveText(item.description, locale),
        href: resolveText(item.href, locale) || OPTIONS[index % OPTIONS.length].href,
      }))
    : OPTIONS.map((option) => ({
        key: option.labelKey,
        icon: option.icon,
        label: t(option.labelKey),
        description: t(option.descKey),
        href: option.href,
      }));

  return (
    <SectionContainer className="bg-card/40">
      <SectionHeading align="center" title={heading} subtitle={subtitle} />

      <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((item, i) => (
          <motion.div
            key={item.key}
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.5, delay: i * 0.08 }}
          >
            <Link
              href={item.href}
              className="group relative flex h-full flex-col rounded-2xl border border-border/60 bg-card p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg"
            >
              <span className="absolute right-5 top-5 font-display text-sm font-semibold text-border transition-colors group-hover:text-primary/50">
                0{i + 1}
              </span>
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-secondary text-primary transition-colors group-hover:bg-primary group-hover:text-white">
                <item.icon className="h-6 w-6" />
              </span>
              <h3 className="mt-5 font-display text-lg font-bold uppercase tracking-wide text-foreground transition-colors group-hover:text-primary">
                {item.label}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {item.description}
              </p>
            </Link>
          </motion.div>
        ))}
      </div>

      <p className="mt-8 text-center text-sm text-muted-foreground">
        <Link href="/como-ayudar" className="font-semibold text-primary underline-offset-4 hover:underline">
          {t("howToHelp.title")} →
        </Link>
      </p>
    </SectionContainer>
  );
}

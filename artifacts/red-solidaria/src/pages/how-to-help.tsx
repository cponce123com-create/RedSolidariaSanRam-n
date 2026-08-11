import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import {
  Heart, HandHeart, Package, Dog, Users, Building2, Megaphone,
  ArrowRight, CheckCircle, Phone, QrCode, Banknote, CreditCard,
  Gift, Leaf, Star
} from "lucide-react";

export default function HowToHelp() {
  const { t } = useTranslation();

  const HELP_WAYS = [
    {
      id: "donar-dinero",
      icon: Heart,
      color: "from-red-50 to-rose-50 border-red-200",
      iconBg: "bg-red-100",
      iconColor: "text-red-600",
      badge: t("howToHelp.moneyBadge"),
      badgeColor: "bg-red-100 text-red-700",
      title: t("howToHelp.moneyTitle"),
      description: t("howToHelp.moneyDesc"),
      steps: [
        t("howToHelp.moneyStep1"),
        t("howToHelp.moneyStep2"),
        t("howToHelp.moneyStep3"),
      ],
      cta: t("howToHelp.moneyCta"),
      ctaHref: "/campanas",
      ctaStyle: "bg-red-500 hover:bg-red-600",
    },
    {
      id: "donar-productos",
      icon: Package,
      color: "from-blue-50 to-indigo-50 border-blue-200",
      iconBg: "bg-blue-100",
      iconColor: "text-blue-600",
      badge: t("howToHelp.productsBadge"),
      badgeColor: "bg-blue-100 text-blue-700",
      title: t("howToHelp.productsTitle"),
      description: t("howToHelp.productsDesc"),
      steps: [
        t("howToHelp.productsStep1"),
        t("howToHelp.productsStep2"),
        t("howToHelp.productsStep3"),
      ],
      cta: t("howToHelp.productsCta"),
      ctaHref: "/contacto",
      ctaStyle: "bg-blue-500 hover:bg-blue-600",
    },
    {
      id: "donar-alimento",
      icon: Dog,
      color: "from-amber-50 to-orange-50 border-amber-200",
      iconBg: "bg-amber-100",
      iconColor: "text-amber-600",
      badge: t("howToHelp.animalFoodBadge"),
      badgeColor: "bg-amber-100 text-amber-700",
      title: t("howToHelp.animalFoodTitle"),
      description: t("howToHelp.animalFoodDesc"),
      steps: [
        t("howToHelp.animalFoodStep1"),
        t("howToHelp.animalFoodStep2"),
        t("howToHelp.animalFoodStep3"),
      ],
      cta: t("howToHelp.animalFoodCta"),
      ctaHref: "/ayuda-animal",
      ctaStyle: "bg-amber-500 hover:bg-amber-600",
    },
    {
      id: "voluntario",
      icon: HandHeart,
      color: "from-green-50 to-emerald-50 border-green-200",
      iconBg: "bg-green-100",
      iconColor: "text-green-600",
      badge: t("howToHelp.volunteerBadge"),
      badgeColor: "bg-green-100 text-green-700",
      title: t("howToHelp.volunteerTitle"),
      description: t("howToHelp.volunteerDesc"),
      steps: [
        t("howToHelp.volunteerStep1"),
        t("howToHelp.volunteerStep2"),
        t("howToHelp.volunteerStep3"),
      ],
      cta: t("howToHelp.volunteerCta"),
      ctaHref: "/voluntariado",
      ctaStyle: "bg-green-600 hover:bg-green-700",
    },
    {
      id: "aliado",
      icon: Building2,
      color: "from-purple-50 to-violet-50 border-purple-200",
      iconBg: "bg-purple-100",
      iconColor: "text-purple-600",
      badge: t("howToHelp.allyBadge"),
      badgeColor: "bg-purple-100 text-purple-700",
      title: t("howToHelp.allyTitle"),
      description: t("howToHelp.allyDesc"),
      steps: [
        t("howToHelp.allyStep1"),
        t("howToHelp.allyStep2"),
        t("howToHelp.allyStep3"),
      ],
      cta: t("howToHelp.allyCta"),
      ctaHref: "/contacto",
      ctaStyle: "bg-purple-600 hover:bg-purple-700",
    },
    {
      id: "difundir",
      icon: Megaphone,
      color: "from-yellow-50 to-amber-50 border-yellow-200",
      iconBg: "bg-yellow-100",
      iconColor: "text-yellow-600",
      badge: t("howToHelp.spreadBadge"),
      badgeColor: "bg-yellow-100 text-yellow-700",
      title: t("howToHelp.spreadTitle"),
      description: t("howToHelp.spreadDesc"),
      steps: [
        t("howToHelp.spreadStep1"),
        t("howToHelp.spreadStep2"),
        t("howToHelp.spreadStep3"),
      ],
      cta: t("howToHelp.spreadCta"),
      ctaHref: "/campanas",
      ctaStyle: "bg-yellow-500 hover:bg-yellow-600",
    },
  ];

  const PAYMENT_METHODS = [
    { icon: QrCode, label: "Yape", value: "921 615 737", color: "text-purple-600" },
    { icon: QrCode, label: "Plin", value: "921 615 737", color: "text-blue-600" },
    { icon: Banknote, label: "BCP", value: "193-12345678-0-55", color: "text-orange-700" },
    { icon: CreditCard, label: t("howToHelp.cash"), value: t("howToHelp.coordinateInSanRamon"), color: "text-green-700" },
  ];

  const FAQS = [
    { q: t("howToHelp.faq1q"), a: t("howToHelp.faq1a") },
    { q: t("howToHelp.faq2q"), a: t("howToHelp.faq2a") },
    { q: t("howToHelp.faq3q"), a: t("howToHelp.faq3a") },
    { q: t("howToHelp.faq4q"), a: t("howToHelp.faq4a") },
  ];

  return (
    <div className="max-w-6xl mx-auto px-4 py-10 sm:py-16">
      {/* Hero */}
      <div className="mb-14 text-center max-w-3xl mx-auto">
        <div className="flex items-center gap-3 mb-5 justify-center">
          <div className="p-3 bg-primary/10 rounded-2xl"><HandHeart className="w-7 h-7 text-primary" /></div>
          <span className="bg-primary/10 text-primary text-sm font-bold px-3 py-1 rounded-full uppercase tracking-wider">{t("howToHelp.participate")}</span>
        </div>
        <h1 className="text-4xl sm:text-5xl font-display font-black mb-4">{t("howToHelp.title")}</h1>
        <p className="text-muted-foreground text-lg leading-relaxed">
          {t("howToHelp.subtitle")}
        </p>
      </div>

      {/* Ways to help grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-16">
        {HELP_WAYS.map((way, i) => (
          <motion.div
            key={way.id}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.08 }}
            className={`bg-gradient-to-br ${way.color} border rounded-3xl p-7 flex flex-col gap-4`}
          >
            <div className="flex items-start justify-between">
              <div className={`p-3 ${way.iconBg} rounded-2xl`}>
                <way.icon className={`w-7 h-7 ${way.iconColor}`} />
              </div>
              <span className={`text-xs font-bold px-3 py-1 rounded-full ${way.badgeColor}`}>{way.badge}</span>
            </div>
            <div>
              <h3 className="font-display font-bold text-xl mb-2">{way.title}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">{way.description}</p>
            </div>
            <div className="space-y-1.5">
              {way.steps.map((step, j) => (
                <div key={j} className="flex items-start gap-2 text-xs text-muted-foreground">
                  <CheckCircle className="w-3.5 h-3.5 text-green-500 shrink-0 mt-0.5" />
                  {step}
                </div>
              ))}
            </div>
            <Link href={way.ctaHref}>
              <Button size="sm" className={`rounded-xl mt-auto gap-1.5 ${way.ctaStyle} text-white`}>
                {way.cta} <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </Link>
          </motion.div>
        ))}
      </div>

      {/* Payment methods */}
      <div className="bg-card border border-border rounded-3xl p-8 mb-12">
        <h2 className="text-2xl font-display font-bold mb-2 text-center">{t("howToHelp.paymentTitle")}</h2>
        <p className="text-muted-foreground text-center mb-8 text-sm">{t("howToHelp.paymentDesc")}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {PAYMENT_METHODS.map((pm, i) => (
            <div key={i} className="bg-secondary/40 rounded-2xl p-5 text-center border border-border">
              <pm.icon className={`w-8 h-8 mx-auto mb-3 ${pm.color}`} />
              <h3 className="font-bold mb-1">{pm.label}</h3>
              <p className="text-xs text-muted-foreground">{pm.value}</p>
            </div>
          ))}
        </div>
        <p className="text-center text-sm text-muted-foreground mt-6">
          {t("howToHelp.afterDonation")}{" "}
          <a href="https://wa.me/51921615737" className="text-green-700 font-semibold hover:underline">WhatsApp 921 615 737</a>
        </p>
      </div>

      {/* Allies CTA */}
      <div className="bg-gradient-to-r from-primary to-primary/80 rounded-3xl p-8 sm:p-12 text-white text-center mb-12">
        <Building2 className="w-12 h-12 mx-auto mb-4 opacity-90" />
        <h2 className="text-3xl font-display font-bold mb-3">{t("howToHelp.alliesTitle")}</h2>
        <p className="text-white/85 text-lg mb-6 max-w-xl mx-auto">{t("howToHelp.alliesDesc")}</p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link href="/aliados">
            <Button size="lg" className="bg-card text-primary hover:bg-card/90 rounded-2xl h-12 px-8 font-bold">
              {t("howToHelp.viewAllies")}
            </Button>
          </Link>
          <Link href="/contacto">
            <Button size="lg" variant="outline" className="border-white text-white hover:bg-card/20 rounded-2xl h-12 px-8">
              {t("howToHelp.becomeAlly")}
            </Button>
          </Link>
        </div>
      </div>

      {/* FAQ rapida */}
      <div className="bg-secondary/30 rounded-3xl p-8">
        <h2 className="text-2xl font-display font-bold mb-6 text-center">{t("howToHelp.faqTitle")}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {FAQS.map((faq, i) => (
            <div key={i} className="bg-card border border-border rounded-2xl p-5">
              <h3 className="font-bold text-sm mb-2">{faq.q}</h3>
              <p className="text-muted-foreground text-sm">{faq.a}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

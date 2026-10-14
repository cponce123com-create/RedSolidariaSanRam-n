import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "wouter";
import { useTranslation } from "react-i18next";
import { QRCodeSVG } from "qrcode.react";
import { AlertTriangle, ArrowLeft, Loader2, ShieldCheck } from "lucide-react";
import SEO, { PUBLIC_BASE_URL } from "@/components/shared/SEO";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

/**
 * Certificado público (Fase 5.2 / B-3). Es la página que abre el QR.
 *
 * Muestra SOLO lo que la organización autoriza: nombre autorizado, tipo, título,
 * fecha y campaña. Nunca el importe ni datos de contacto. Un certificado revocado
 * responde 404 y aquí se explica que no está disponible.
 *
 * Se marca `noIndex`: lleva el nombre de una persona y no debe aparecer en
 * buscadores; solo se llega por el enlace o el QR.
 */
interface PublicCertificate {
  code: string;
  holderName: string;
  type: string;
  title: string;
  description: string | null;
  issuedAt: string;
  campaignTitle: string | null;
}

async function fetchCertificate(code: string): Promise<PublicCertificate | null> {
  const res = await fetch(`/api/certificates/${encodeURIComponent(code)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("certificate_load_failed");
  return res.json();
}

/** Normaliza lo que llega por la URL: mayúsculas y sin espacios ni guiones. */
function normalize(code: string | undefined): string {
  return (code ?? "").trim().toUpperCase().replace(/[\s-]/g, "");
}

function formatIssuedAt(value: string, lang: string): string {
  const date = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(lang === "en" ? "en-GB" : "es-PE", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default function CertificatePage() {
  const params = useParams<{ code: string }>();
  const { t, i18n } = useTranslation();
  const lang = i18n.language?.toLowerCase().startsWith("en") ? "en" : "es";
  const code = normalize(params.code);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["certificate", code],
    queryFn: () => fetchCertificate(code),
    enabled: code.length > 0,
    retry: false,
  });

  const shareUrl = `${PUBLIC_BASE_URL}/certificados/${code}`;

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 text-muted-foreground">
        <Loader2 className="w-8 h-8 animate-spin" aria-hidden />
        <p className="text-sm">{t("certificate.loading")}</p>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <>
        <SEO title={t("certificate.notFoundTitle")} noIndex />
        <div className="min-h-screen flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-card border border-border rounded-2xl p-6 text-center">
            <AlertTriangle className="w-8 h-8 mx-auto text-amber-600 mb-3" aria-hidden />
            <h1 className="font-display font-bold text-lg mb-2">{t("certificate.notFoundTitle")}</h1>
            <p className="text-sm text-muted-foreground mb-4">{t("certificate.notFoundText")}</p>
            <Link href="/">
              <Button variant="outline" className="rounded-xl">
                <ArrowLeft className="w-4 h-4 mr-2" aria-hidden />
                {t("certificate.backHome")}
              </Button>
            </Link>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <SEO title={`${t("certificate.title")} · ${data.holderName}`} noIndex />
      <div className="min-h-screen bg-secondary/30 py-10 px-4">
        <div className="max-w-2xl mx-auto">
          <div className="bg-card border-2 border-primary/20 rounded-3xl p-8 shadow-sm text-center">
            <div className="flex items-center justify-center gap-2 text-primary mb-1">
              <ShieldCheck className="w-5 h-5" aria-hidden />
              <span className="text-xs font-semibold uppercase tracking-widest">
                {t("seo.siteName")}
              </span>
            </div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold mt-3" data-testid="certificate-title">
              {data.title}
            </h1>
            <p className="text-sm text-muted-foreground mt-2">{t("certificate.issuedTo")}</p>
            <p className="font-display text-xl font-semibold mt-1" data-testid="certificate-holder">
              {data.holderName}
            </p>

            <div className="flex flex-wrap items-center justify-center gap-2 mt-4">
              <Badge variant="secondary" className="rounded-lg">
                {t(`certificate.type.${data.type}`, { defaultValue: data.type })}
              </Badge>
              <Badge variant="outline" className="rounded-lg">
                {formatIssuedAt(data.issuedAt, lang)}
              </Badge>
              {data.campaignTitle && (
                <Badge variant="outline" className="rounded-lg">
                  {data.campaignTitle}
                </Badge>
              )}
            </div>

            {data.description && (
              <p className="text-sm text-foreground mt-5 whitespace-pre-line">{data.description}</p>
            )}

            <div className="mt-8 flex flex-col items-center gap-3">
              <div className="rounded-2xl border border-border bg-white p-3">
                <QRCodeSVG
                  value={shareUrl}
                  size={148}
                  level="M"
                  bgColor="#ffffff"
                  fgColor="#0a0a0a"
                  aria-label={t("certificate.qrAria")}
                />
              </div>
              <p className="text-xs text-muted-foreground font-mono tracking-widest" data-testid="certificate-code">
                {data.code}
              </p>
            </div>
          </div>

          <p className="text-xs text-muted-foreground text-center mt-5">{t("certificate.publicNote")}</p>
        </div>
      </div>
    </>
  );
}

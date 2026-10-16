import { Link } from "wouter";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useInstitutionalIdentity } from "@/hooks/use-institutional-identity";
import { optimizeImageUrl } from "@/lib/image-url";

/**
 * Portada institucional (Fase 3). Se muestra en la página principal SOLO si el
 * superadmin configuró una portada o un texto principal; si no, no renderiza
 * nada y el home queda exactamente como estaba (la web nunca se rompe por no
 * tener identidad publicada).
 */
export function InstitutionalCover() {
  const { data: identity } = useInstitutionalIdentity();
  if (!identity) return null;

  const desktop = identity.cover.desktopUrl
    ? optimizeImageUrl(identity.cover.desktopUrl, { width: 1600 })
    : "";
  const mobile = identity.cover.mobileUrl
    ? optimizeImageUrl(identity.cover.mobileUrl, { width: 800 })
    : "";
  const hasCover = Boolean(desktop || mobile);
  const { title, subtitle, ctaLabel, ctaHref } = identity.hero;

  if (!hasCover && !title && !subtitle) return null;

  const onCover = hasCover;

  return (
    <section className="relative isolate overflow-hidden border-b border-border bg-primary/5">
      {hasCover && (
        <>
          <picture>
            {mobile && <source media="(max-width: 640px)" srcSet={mobile} />}
            <img
              src={desktop || mobile}
              alt=""
              className="absolute inset-0 -z-10 h-full w-full object-cover"
              style={{ objectPosition: identity.cover.focus || "50% 50%" }}
            />
          </picture>
          {/* Velo para que el texto sea legible sobre la foto */}
          <div aria-hidden className="absolute inset-0 -z-10 bg-black/35" />
        </>
      )}
      <div className="relative mx-auto max-w-5xl px-4 py-20 text-center sm:py-28">
        {title && (
          <h1 className={`font-display text-3xl font-bold sm:text-5xl ${onCover ? "text-white drop-shadow" : "text-foreground"}`}>
            {title}
          </h1>
        )}
        {subtitle && (
          <p className={`mx-auto mt-4 max-w-2xl text-lg ${onCover ? "text-white/90" : "text-muted-foreground"}`}>
            {subtitle}
          </p>
        )}
        {ctaLabel && ctaHref && (
          <Button asChild size="lg" className="mt-8 h-14 rounded-xl px-7 text-base font-semibold">
            {ctaHref.startsWith("/") ? (
              <Link href={ctaHref}>
                {ctaLabel}
                <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
            ) : (
              <a href={ctaHref} target="_blank" rel="noopener noreferrer">
                {ctaLabel}
                <ArrowRight className="ml-2 h-5 w-5" />
              </a>
            )}
          </Button>
        )}
      </div>
    </section>
  );
}

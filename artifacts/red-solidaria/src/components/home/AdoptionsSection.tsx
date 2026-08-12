import { motion } from "framer-motion";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { ArrowRight, PawPrint } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/EmptyState";
import { optimizeImageUrl } from "@/lib/image-url";
import { SectionContainer, SectionHeading } from "./SectionHeading";

/** Subconjunto de Pet devuelto por GET /api/pets. */
interface HomePet {
  id: number;
  name: string;
  species: string;
  location?: string | null;
  status: string;
  urgent?: boolean | null;
  photos: string[] | null;
}

const PET_FALLBACK_IMG = "https://images.unsplash.com/photo-1548199973-03cce0bbc87b?w=600&q=80";

/**
 * "Ellos también esperan una familia" — mascotas reales en adopción
 * (GET /api/pets?status=available), cálido y sin aspecto de tienda.
 */
export function AdoptionsSection() {
  const { t } = useTranslation();

  const { data: pets, isLoading } = useQuery<HomePet[]>({
    queryKey: ["home-pets-available"],
    queryFn: async () => {
      const res = await fetch("/api/pets?status=available");
      if (!res.ok) throw new Error("failed");
      return res.json();
    },
  });

  const visible = (pets ?? []).slice(0, 4);

  return (
    <SectionContainer className="bg-card/40">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <SectionHeading
          title={t("home.adoptionsSectionTitle")}
          subtitle={t("home.adoptionsSectionSubtitle")}
        />
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="shrink-0"
        >
          <Button asChild variant="ghost" className="text-primary hover:bg-secondary/70 hover:text-primary">
            <Link href="/adopciones">
              {t("home.adoptionsViewAll")}
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </Link>
          </Button>
        </motion.div>
      </div>

      <div className="mt-10">
        {isLoading ? (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse overflow-hidden rounded-2xl border border-border/60 bg-card">
                <div className="aspect-square w-full bg-muted" />
                <div className="space-y-2 p-4">
                  <div className="h-4 w-1/2 rounded bg-muted" />
                  <div className="h-3 w-3/4 rounded bg-muted" />
                </div>
              </div>
            ))}
          </div>
        ) : visible.length > 0 ? (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {visible.map((pet, i) => (
              <motion.article
                key={pet.id}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.5, delay: i * 0.08 }}
              >
                <Link
                  href={`/adopciones/${pet.id}`}
                  className="group block overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg"
                >
                  <div className="relative aspect-square overflow-hidden bg-muted">
                    <img
                      src={
                        pet.photos && pet.photos.length > 0
                          ? optimizeImageUrl(pet.photos[0], { width: 400 })
                          : PET_FALLBACK_IMG
                      }
                      alt={pet.name}
                      loading="lazy"
                      decoding="async"
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                    {pet.urgent && (
                      <Badge className="absolute left-3 top-3 bg-red-600 text-white shadow-sm">
                        {t("adoptions.urgentBadge")}
                      </Badge>
                    )}
                  </div>
                  <div className="p-4">
                    <div className="flex items-baseline justify-between gap-2">
                      <h3 className="font-display text-base font-bold text-foreground transition-colors group-hover:text-primary sm:text-lg">
                        {pet.name}
                      </h3>
                      <span className="shrink-0 text-xs font-medium text-muted-foreground">
                        {pet.species === "cat" ? t("adoptions.speciesCat") : t("adoptions.speciesDog")}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {pet.location ?? t("home.campaignsLocation")}
                    </p>
                    <span className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-primary">
                      {t("home.adoptionsMeet")}
                      <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                    </span>
                  </div>
                </Link>
              </motion.article>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={PawPrint}
            title={t("home.adoptionsEmptyTitle")}
            description={t("home.adoptionsEmptyDesc")}
            action={
              <Button asChild variant="outline">
                <Link href="/ayuda-animal">{t("adoptions.viewAnimalWelfare")}</Link>
              </Button>
            }
          />
        )}
      </div>
    </SectionContainer>
  );
}

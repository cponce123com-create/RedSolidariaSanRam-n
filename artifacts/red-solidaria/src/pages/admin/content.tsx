import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, CheckCircle2, Clock, FileText, Loader2 } from "lucide-react";
import { useAdminCmsPages } from "@/hooks/use-cms-page";

/**
 * Contenido → Editor de páginas (Fase 2).
 *
 * Listado de las páginas administrables con su estado real: sin publicar, publicado,
 * programado o con cambios sin publicar. Desde aquí se abre el editor de cada página.
 */
export default function AdminContent() {
  const { t } = useTranslation();
  const { data, isLoading, isError } = useAdminCmsPages();

  const pages = data?.pages ?? [];

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold text-foreground">
          Editor de páginas
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Edita el contenido de la web sin tocar código. Guarda un borrador, previsualiza en
          escritorio y móvil, y publica cuando esté listo.
        </p>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Cargando páginas…
        </div>
      )}

      {isError && (
        <div className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4" /> No se pudieron cargar las páginas.
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {pages.map((page) => (
          <Link key={page.slug} href={`/admin/contenido/${page.slug}`}>
            <Card className="h-full cursor-pointer transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-start justify-between gap-2 text-base">
                  <span className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-primary" />
                    {page.title}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-1.5">
                  <StatusBadge status={page.status} hasPending={page.hasPendingChanges} />
                  {page.wired ? (
                    <Badge variant="secondary" className="text-[10px]">
                      <CheckCircle2 className="mr-1 h-3 w-3" /> En la web
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px]">
                      Pendiente de conectar
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {page.publishedAt
                    ? `Publicado: ${new Date(page.publishedAt).toLocaleString("es-PE")}`
                    : "Sin publicar todavía"}
                </p>
                {page.scheduledAt && (
                  <p className="flex items-center gap-1 text-xs text-amber-700">
                    <Clock className="h-3 w-3" />
                    Programado: {new Date(page.scheduledAt).toLocaleString("es-PE")}
                  </p>
                )}
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <p className="mt-6 text-xs text-muted-foreground">{t("footer.transparencyText")}</p>
    </div>
  );
}

function StatusBadge({ status, hasPending }: { status: string; hasPending: boolean }) {
  if (status === "published") {
    return (
      <Badge className="bg-green-600 text-[10px] text-white hover:bg-green-600">
        <CheckCircle2 className="mr-1 h-3 w-3" /> Publicado
      </Badge>
    );
  }
  if (status === "scheduled") {
    return (
      <Badge className="bg-amber-500 text-[10px] text-white hover:bg-amber-500">
        <Clock className="mr-1 h-3 w-3" /> Programado
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-[10px]">
      {hasPending ? "Borrador con cambios" : "Borrador"}
    </Badge>
  );
}

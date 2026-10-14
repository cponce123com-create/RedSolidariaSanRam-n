import { Link, useParams } from "wouter";
import { useTranslation } from "react-i18next";
import { useGetNewsPost, getGetNewsPostQueryKey } from "@workspace/api-client-react";
import { ArrowLeft, Calendar, Newspaper } from "lucide-react";
import { Button } from "@/components/ui/button";
import SEO from "@/components/shared/SEO";
import { formatSafeDate, getDateFormatLocale } from "@/lib/i18n/date";
import { optimizeImageUrl } from "@/lib/image-url";

/**
 * Detalle de una noticia (Fase 7 · V7.1).
 *
 * La página de noticias enlazaba a `/noticias/:id` («Leer más») pero esa ruta NO
 * existía: cada enlace llevaba a la página 404. Aquí se implementa el detalle
 * reutilizando el endpoint público ya existente `GET /api/news/:id`, sin crear
 * ni duplicar el modelo de datos.
 */
export default function NewsDetail() {
  const { t } = useTranslation();
  const params = useParams<{ id?: string }>();
  const id = Number(params.id);
  const validId = Number.isInteger(id) && id > 0;

  const { data: post, isLoading, isError } = useGetNewsPost(id, {
    query: { queryKey: getGetNewsPostQueryKey(id), enabled: validId, retry: false },
  });

  const notFound = !validId || isError || (!isLoading && !post);

  return (
    <div className="min-h-screen pt-20 bg-background">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <Link href="/noticias">
          <Button variant="ghost" className="rounded-xl gap-2 mb-8 -ml-2">
            <ArrowLeft className="w-4 h-4" /> {t("news.backToList")}
          </Button>
        </Link>

        {isLoading ? (
          <div className="space-y-6">
            <div className="h-8 w-2/3 bg-muted animate-pulse rounded-xl" />
            <div className="h-64 bg-muted animate-pulse rounded-2xl" />
            <div className="h-40 bg-muted animate-pulse rounded-2xl" />
          </div>
        ) : notFound || !post ? (
          <div className="text-center py-20">
            <Newspaper className="w-16 h-16 text-muted-foreground opacity-20 mx-auto mb-4" />
            <h1 className="font-display font-bold text-2xl mb-2">{t("news.notFoundTitle")}</h1>
            <p className="text-muted-foreground mb-6">{t("news.notFoundDescription")}</p>
            <Link href="/noticias">
              <Button className="rounded-xl">{t("news.backToList")}</Button>
            </Link>
          </div>
        ) : (
          <article>
            <SEO
              title={`${post.title} — Red Solidaria San Ramón`}
              description={post.summary}
              url={`/noticias/${post.id}`}
              type="article"
              image={post.imageUrl || undefined}
            />
            <div className="flex items-center gap-2 text-sm text-primary font-medium mb-4">
              <Calendar className="w-4 h-4" />
              {formatSafeDate(post.publishedAt, t("news.dateFormat"), {
                locale: getDateFormatLocale(),
              })}
            </div>
            <h1 className="text-3xl sm:text-4xl font-display font-bold text-foreground mb-6">
              {post.title}
            </h1>
            {post.imageUrl && (
              <img
                src={optimizeImageUrl(post.imageUrl, { width: 1200 })}
                alt={post.title}
                loading="lazy"
                decoding="async"
                className="w-full rounded-2xl mb-8 border border-border"
              />
            )}
            <p className="text-lg text-muted-foreground font-medium mb-6">{post.summary}</p>
            <div className="prose prose-neutral max-w-none whitespace-pre-wrap text-foreground leading-relaxed">
              {post.content}
            </div>
          </article>
        )}
      </div>
    </div>
  );
}

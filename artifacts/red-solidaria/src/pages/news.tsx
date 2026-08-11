import { useGetNews } from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Link } from "wouter";
import { format } from "date-fns";
import { getDateFormatLocale } from "@/lib/i18n/date";
import { useTranslation } from "react-i18next";
import { EmptyState } from "@/components/shared/EmptyState";
import { Newspaper } from "lucide-react";

export default function News() {
  const { t } = useTranslation();
  const { data: news, isLoading } = useGetNews();

  return (
    <div className="min-h-screen pt-20 bg-background">
      <section className="py-12 bg-secondary/30 border-b border-border/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl md:text-5xl font-display font-bold mb-6">{t("footer.newsBlog")}</h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            {t("news.subtitle")}
          </p>
        </div>
      </section>

      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {[1,2,3].map(i => (
                <div key={i} className="h-[400px] bg-muted animate-pulse rounded-2xl" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {news && news.length > 0 ? (
                news.map(post => (
                <Link key={post.id} href={`/noticias/${post.id}`}>
                  <Card className="h-full overflow-hidden hover-elevate border-border/50 group cursor-pointer flex flex-col">
                    <div className="h-48 overflow-hidden bg-muted">
                      <img 
                        src={post.imageUrl || "https://images.unsplash.com/photo-1593113630400-ea4288922497?w=800&q=80"} 
                        alt={post.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                    </div>
                    <div className="p-6 flex flex-col flex-grow">
                      <div className="text-sm text-primary font-medium mb-3">
                        {format(new Date(post.publishedAt), t("news.dateFormat"), { locale: getDateFormatLocale() })}
                      </div>
                      <h3 className="text-xl font-display font-bold mb-3 group-hover:text-primary transition-colors line-clamp-2">
                        {post.title}
                      </h3>
                      <p className="text-muted-foreground line-clamp-3 mb-4 flex-grow">
                        {post.summary}
                      </p>
                      <span className="text-primary font-medium hover:underline mt-auto">{t("news.readMore")}</span>
                    </div>
                  </Card>
                </Link>
              ))) : (
                <EmptyState
                  icon={Newspaper}
                  title={t("news.emptyTitle")}
                  description={t("news.emptyDescription")}
                  className="col-span-full"
                />
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

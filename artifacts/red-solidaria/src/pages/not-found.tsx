import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";

export default function NotFound() {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen pt-20 flex items-center justify-center bg-background">
      <div className="text-center max-w-md px-4">
        <h1 className="text-6xl font-display font-bold text-primary mb-4">404</h1>
        <h2 className="text-2xl font-bold mb-4">{t("notFound.title")}</h2>
        <p className="text-muted-foreground mb-8">{t("notFound.description")}</p>
        <Link href="/">
          <Button className="rounded-xl px-8">{t("notFound.backHome")}</Button>
        </Link>
      </div>
    </div>
  );
}

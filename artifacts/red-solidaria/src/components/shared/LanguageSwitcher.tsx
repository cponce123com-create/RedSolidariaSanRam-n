import { useTranslation } from "react-i18next";
import { setAppLanguage } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const OPTIONS = [
  { code: "es" as const, label: "ES" },
  { code: "en" as const, label: "EN" },
];

/** Switcher ES/EN: pills con el idioma activo resaltado (persiste en localStorage). */
export function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const active = i18n.language?.toLowerCase().startsWith("en") ? "en" : "es";

  return (
    <div
      role="group"
      aria-label="Idioma / Language"
      className="flex items-center rounded-full border border-border bg-secondary/60 p-0.5"
    >
      {OPTIONS.map(({ code, label }) => (
        <button
          key={code}
          type="button"
          onClick={() => setAppLanguage(code)}
          aria-pressed={active === code}
          className={cn(
            "rounded-full px-2.5 py-1 text-xs font-bold transition-colors",
            active === code
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

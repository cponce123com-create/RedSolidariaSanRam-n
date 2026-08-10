import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

/**
 * Estado vacío consistente para grillas/listas sin contenido.
 * Usa tokens de tema (bg-card/text-muted-foreground) → funciona en claro y oscuro.
 */
export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center py-16 px-6 rounded-3xl bg-card border border-border shadow-sm",
        className
      )}
    >
      {Icon && (
        <div className="p-3 rounded-full bg-secondary text-muted-foreground mb-4">
          <Icon className="w-8 h-8" />
        </div>
      )}
      <h3 className="text-lg font-display font-bold text-foreground mb-1">{title}</h3>
      {description && <p className="text-sm text-muted-foreground max-w-sm mb-5">{description}</p>}
      {action}
    </div>
  );
}

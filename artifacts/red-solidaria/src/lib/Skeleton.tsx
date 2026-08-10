/**
 * Componentes Skeleton para mejorar la percepción de carga
 * Proporcionan feedback visual mientras se cargan los datos
 */

import { cn } from "./utils";

interface SkeletonProps {
  className?: string;
  animation?: "pulse" | "shine" | "none";
}

export function Skeleton({ className, animation = "pulse" }: SkeletonProps) {
  return (
    <div
      className={cn(
        "bg-muted rounded",
        animation === "pulse" && "animate-pulse",
        animation === "shine" && "relative overflow-hidden bg-gradient-to-r from-muted via-secondary to-muted bg-[length:200%_100%] animate-[shimmer_1.5s_infinite]",
        className
      )}
    />
  );
}

export function CardSkeleton() {
  return (
    <div className="bg-card rounded-lg shadow-md p-6 space-y-4">
      <Skeleton className="h-48 w-full" animation="pulse" />
      <Skeleton className="h-6 w-3/4" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-5/6" />
      <div className="flex justify-between pt-4">
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-8 w-20" />
      </div>
    </div>
  );
}

export function ListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center space-x-4">
          <Skeleton className="h-12 w-12 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function TableSkeleton({ rows = 5, columns = 4 }: { rows?: number; columns?: number }) {
  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex space-x-4">
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={i} className="h-4 flex-1" />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} className="flex space-x-4">
          {Array.from({ length: columns }).map((_, colIndex) => (
            <Skeleton key={colIndex} className="h-10 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-card p-6 rounded-lg shadow">
            <Skeleton className="h-4 w-24 mb-2" />
            <Skeleton className="h-8 w-16" />
          </div>
        ))}
      </div>
      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-8">
      <Skeleton className="h-10 w-1/3" />
      <DashboardSkeleton />
    </div>
  );
}

// Keyframes personalizados para animación shine
const shimmerStyles = `
@keyframes shimmer {
  0% {
    background-position: -200% 0;
  }
  100% {
    background-position: 200% 0;
  }
}
`;

// Inyectar estilos si no existen
if (typeof document !== "undefined") {
  const styleId = "skeleton-shimmer-styles";
  if (!document.getElementById(styleId)) {
    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = shimmerStyles;
    document.head.appendChild(style);
  }
}

// Helpers de render con providers (react-query, tooltips, toasts, router).
import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toaster";
import { Router, Route } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import type { ReactElement, ReactNode } from "react";

interface RenderOptions {
  /** URL actual simulada (p.ej. "/campanas/1/transparencia"). Sin path se usa "/". */
  path?: string;
  /** Plantilla de ruta para useParams (p.ej. "/campanas/:id/transparencia"). */
  routePath?: string;
}

export function renderWithProviders(ui: ReactElement, options: RenderOptions = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  function Wrapper({ children }: { children: ReactNode }) {
    if (options.path) {
      // memoryLocation fija la URL actual para que <Route> haga match y
      // useParams() devuelva los parámetros (jsdom arranca en "/").
      const { hook } = memoryLocation({ path: options.path });
      return (
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <Router hook={hook}>
              <Route path={options.routePath ?? options.path}>{children}</Route>
            </Router>
            <Toaster />
          </TooltipProvider>
        </QueryClientProvider>
      );
    }
    return (
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Router base="/">{children}</Router>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    );
  }

  return { ...render(ui, { wrapper: Wrapper }), queryClient };
}

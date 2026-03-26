import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="min-h-screen pt-20 flex items-center justify-center bg-background">
      <div className="text-center max-w-md px-4">
        <h1 className="text-6xl font-display font-bold text-primary mb-4">404</h1>
        <h2 className="text-2xl font-bold mb-4">Página no encontrada</h2>
        <p className="text-muted-foreground mb-8">La página que buscas no existe o ha sido movida.</p>
        <Link href="/">
          <Button className="rounded-xl px-8">Volver al Inicio</Button>
        </Link>
      </div>
    </div>
  );
}

import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { adminRequestJson } from "@/lib/admin-request";
import { errorMessage } from "@/lib/api-error";

interface FacebookStatus {
  status: string;
  pageIdConfigured: boolean;
  tokenConfigured: boolean;
  message: string;
  page?: { id: string; name: string };
  publishingVerified: false;
  autoPublishEnabled: boolean;
  siteUrlConfigured: boolean;
}

export function FacebookConnectionCard() {
  const check = useMutation({
    mutationFn: () => adminRequestJson<FacebookStatus>("/api/admin/integrations/facebook/status"),
    retry: false,
  });
  return (
    <section aria-labelledby="facebook-connection-title" className="rounded-2xl border border-border bg-card p-6 space-y-4">
      <h2 id="facebook-connection-title" className="font-semibold">Conexión con Facebook</h2>
      <p className="text-sm text-muted-foreground">Comprueba desde el servidor el acceso a tu página. Esta comprobación no crea publicaciones.</p>
      <Button type="button" variant="outline" disabled={check.isPending} onClick={() => check.mutate()}>
        {check.isPending ? "Comprobando Facebook…" : "Comprobar conexión con Facebook"}
      </Button>
      {check.isError && <p role="alert" className="text-sm text-destructive">{errorMessage(check.error)}</p>}
      {check.data && !check.isPending && !check.isError && (
        <div role="status" className="text-sm space-y-2">
          <p>{check.data.message}</p>
          <p>ID de página: {check.data.pageIdConfigured ? "Configurado" : "Falta configurar"}. Token: {check.data.tokenConfigured ? "Configurado" : "Falta configurar"}.</p>
          {check.data.page && <p>Página verificada: <strong>{check.data.page.name}</strong> · {check.data.page.id}</p>}
          <p>{check.data.autoPublishEnabled ? "Publicación automática activada: noticias, campañas, aportes confirmados, mascotas y casos aprobados, novedades y cierres de campaña." : "Publicación automática desactivada o configuración incompleta. Revisa las variables de Facebook y SITE_URL en Render."}</p>
          {!check.data.siteUrlConfigured && <p>Configura SITE_URL con la dirección HTTPS pública de tu web, sin rutas adicionales.</p>}
          <p className="text-muted-foreground">El primer envío confirmará los permisos de publicación. Consulta su resultado en Noticias o Campañas. El token puede caducar o ser revocado.</p>
        </div>
      )}
    </section>
  );
}

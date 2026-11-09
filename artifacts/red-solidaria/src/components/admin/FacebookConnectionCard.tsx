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
          <p className="text-muted-foreground">Los permisos de publicación y la caducidad del token se revisan aparte. Publicar desde la web sigue pendiente de implementación.</p>
        </div>
      )}
    </section>
  );
}

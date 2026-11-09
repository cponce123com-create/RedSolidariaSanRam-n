import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { adminRequestJson } from "@/lib/admin-request";
import { errorMessage } from "@/lib/api-error";

interface Delivery {
  status: string; attempts: number; lastError: string | null; postUrl: string | null;
}
const labels: Record<string, string> = {
  pending: "Pendiente de envío", processing: "Enviando", published: "Publicado",
  failed: "No se pudo publicar", uncertain: "Requiere revisión", cancelled: "Envío cancelado",
};

export function FacebookPublicationStatus({ kind, sourceId, publishable = true }: { kind: "news" | "campaign"; sourceId: number; publishable?: boolean }) {
  const client = useQueryClient();
  const key = ["facebook-publication", kind, sourceId];
  const url = `/api/admin/integrations/facebook/publications/${kind}/${sourceId}`;
  const state = useQuery<{ publication: Delivery | null; autoPublishEnabled: boolean }>({
    queryKey: key, queryFn: () => adminRequestJson(url), staleTime: 0,
    refetchInterval: query => !query.state.data?.publication || ["pending", "processing"].includes(query.state.data.publication.status) ? 15_000 : false,
  });
  const send = useMutation({
    mutationFn: (confirmNotPublished: boolean) => adminRequestJson(url, { method: "POST",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirmNotPublished }) }),
    onSuccess: () => { void client.invalidateQueries({ queryKey: key }); },
  });
  if (state.isLoading) return <p className="text-xs text-muted-foreground">Consultando Facebook…</p>;
  if (state.isError) return <p className="text-xs text-destructive">No se pudo consultar el estado de Facebook. <button type="button" className="underline" onClick={() => void state.refetch()}>Reintentar consulta</button></p>;
  const delivery = state.data?.publication;
  const retry = () => {
    const confirmed = delivery?.status === "uncertain"
      ? window.confirm("Revisa la página de Facebook antes de continuar. ¿Confirmas que esta publicación NO existe? Reintentar sin comprobarlo puede duplicarla.") : false;
    if (delivery?.status === "uncertain" && !confirmed) return;
    send.mutate(confirmed);
  };
  return (
    <div className="mt-2 space-y-1 text-xs" aria-label="Estado de publicación en Facebook">
      <p>Facebook: <strong>{delivery ? labels[delivery.status] ?? delivery.status : "Sin envío registrado"}</strong></p>
      {delivery?.lastError && <p className="text-muted-foreground">{delivery.lastError}</p>}
      {delivery?.postUrl && <a href={delivery.postUrl} target="_blank" rel="noopener noreferrer" className="text-primary underline">Ver publicación en Facebook</a>}
      {!state.data?.autoPublishEnabled && <p className="text-muted-foreground">Revisa la activación y credenciales en Configuración → Facebook.</p>}
      {!publishable && !delivery && <p className="text-muted-foreground">Se enviará al activar la campaña.</p>}
      {publishable && state.data?.autoPublishEnabled && (!delivery || ["failed", "uncertain", "cancelled"].includes(delivery.status)) && (
        <Button type="button" variant="outline" size="sm" className="h-auto py-1 text-xs whitespace-normal" disabled={send.isPending} onClick={retry}>
          {send.isPending ? "Guardando envío…" : delivery?.status === "uncertain" ? "Revisar y reintentar" : delivery ? "Reintentar envío a Facebook" : "Enviar a Facebook"}
        </Button>
      )}
      {send.isError && <p role="alert" className="text-destructive">{errorMessage(send.error)}</p>}
    </div>
  );
}

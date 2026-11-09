import { useState } from "react";
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

export function FacebookPublicationStatus({ kind, sourceId, publishable = true, waitingText = "Se enviará cuando esté aprobado para publicación." }: {
  kind: "news" | "campaign" | "donation" | "pet" | "report" | "update" | "campaign_result";
  sourceId: number; publishable?: boolean; waitingText?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const client = useQueryClient();
  const key = ["facebook-publication", kind, sourceId];
  const url = `/api/admin/integrations/facebook/publications/${kind}/${sourceId}`;
  const state = useQuery<{ publication: Delivery | null; autoPublishEnabled: boolean; publishable?: boolean; canRequest?: boolean;
    preview?: { title: string; summary: string; imageUrl: string | null; link: string | null; message?: string | null } | null }>({
    queryKey: key, queryFn: () => adminRequestJson(url), enabled: expanded, staleTime: 60_000,
    retry: false, refetchOnWindowFocus: false, refetchOnReconnect: false,
    refetchInterval: query => expanded && !query.state.error && query.state.data?.autoPublishEnabled &&
      ["pending", "processing"].includes(query.state.data?.publication?.status ?? "") ? 60_000 : false,
  });
  const send = useMutation({
    mutationFn: (confirmNotPublished: boolean) => adminRequestJson(url, { method: "POST",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirmNotPublished }) }),
    onSuccess: () => { void client.invalidateQueries({ queryKey: key }); },
  });
  const toggle = <button type="button" className="text-xs text-primary underline" aria-expanded={expanded}
    onClick={() => setExpanded(value => !value)}>{expanded ? "Ocultar estado de Facebook" : "Ver estado de Facebook"}</button>;
  if (!expanded) return <div className="mt-2">{toggle}</div>;
  if (state.isLoading) return <div className="mt-2">{toggle}<p className="text-xs text-muted-foreground">Consultando Facebook…</p></div>;
  if (state.isError) return <div className="mt-2">{toggle}<p className="text-xs text-destructive">{errorMessage(state.error, "No se pudo consultar el estado de Facebook.")} <button type="button" className="underline" onClick={() => void state.refetch()}>Reintentar consulta</button></p></div>;
  const delivery = state.data?.publication;
  const canPublish = publishable && state.data?.publishable !== false;
  const retry = () => {
    const confirmed = delivery?.status === "uncertain"
      ? window.confirm("Revisa la página de Facebook antes de continuar. ¿Confirmas que esta publicación NO existe? Reintentar sin comprobarlo puede duplicarla.") : false;
    if (delivery?.status === "uncertain" && !confirmed) return;
    send.mutate(confirmed);
  };
  return (
    <div className="mt-2 space-y-1 text-xs" aria-label="Estado de publicación en Facebook">
      {toggle}
      <p>Facebook: <strong>{delivery ? labels[delivery.status] ?? delivery.status : "Sin envío registrado"}</strong></p>
      {delivery?.lastError && <p className="text-muted-foreground">{delivery.lastError}</p>}
      {delivery?.postUrl && <a href={delivery.postUrl} target="_blank" rel="noopener noreferrer" className="text-primary underline">Ver publicación en Facebook</a>}
      {!state.data?.autoPublishEnabled && <p className="text-muted-foreground">Revisa la activación y credenciales en Configuración → Facebook.</p>}
      {!canPublish && !delivery && <p className="text-muted-foreground">{kind === "campaign" ? "Se enviará al activar la campaña." : waitingText}</p>}
      {!canPublish && kind !== "campaign" && delivery?.status === "published" && <p className="text-amber-800">El contenido ya no cumple los requisitos en la web. Revisa y, si corresponde, retira la publicación de Facebook.</p>}
      {state.data?.preview && <details className="rounded-lg border p-2">
        <summary className="cursor-pointer font-medium">Vista previa de Facebook</summary>
        {state.data.preview.imageUrl?.startsWith("https://") && <img src={state.data.preview.imageUrl} alt="Imagen de la publicación" className="mt-2 max-h-32 rounded-lg object-contain" loading="lazy" />}
        {state.data.preview.message ? <p className="mt-2 whitespace-pre-line">{state.data.preview.message}</p> : <>
          <p className="mt-2 font-semibold">{state.data.preview.title}</p>
          <p className="mt-1 whitespace-pre-line">{state.data.preview.summary}</p>
        </>}
        {state.data.preview.link && <a href={state.data.preview.link} target="_blank" rel="noopener noreferrer" className="mt-1 block break-all text-primary underline">{state.data.preview.link}</a>}
        <p className="mt-1 text-muted-foreground">Se vuelve a comprobar el contenido y sus autorizaciones al enviarlo.</p>
      </details>}
      {canPublish && state.data?.canRequest !== false && state.data?.autoPublishEnabled && (!delivery || ["failed", "uncertain", "cancelled"].includes(delivery.status)) && (
        <Button type="button" variant="outline" size="sm" className="h-auto py-1 text-xs whitespace-normal" disabled={send.isPending} onClick={retry}>
          {send.isPending ? "Guardando envío…" : delivery?.status === "uncertain" ? "Revisar y reintentar" : delivery ? "Reintentar envío a Facebook" : "Enviar a Facebook"}
        </Button>
      )}
      {send.isError && <p role="alert" className="text-destructive">{errorMessage(send.error)}</p>}
    </div>
  );
}

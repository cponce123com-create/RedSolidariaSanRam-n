import type { FacebookContent } from "./facebook-publisher";

interface DonationAnnouncement {
  id: number; amount: string | number; collaborationType: string;
  campaignId: number | null; campaignTitle: string | null; campaignImage: string | null;
  recognitionName: string | null;
}

/** Only pass an explicitly authorized recognitionName, never a raw donor record. */
export function donationFacebookContent(d: DonationAnnouncement, items: readonly { product: string; receivedQuantity: string | number; unit: string }[] = []): FacebookContent {
  const thanks = d.recognitionName ? `Gracias a ${d.recognitionName} por sumarse.` : "Gracias a una persona solidaria por sumarse.";
  const destination = d.campaignTitle ? ` para ${d.campaignTitle}` : " para nuestra labor solidaria";
  let contribution: string;
  if (d.collaborationType === "dinero") contribution = `Confirmamos un aporte de S/ ${Number(d.amount).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${destination}.`;
  else {
    const labels: Record<string, string> = { productos: "productos", servicios: "servicios", logistica: "apoyo logístico" };
    contribution = `Confirmamos un aporte verificado de ${labels[d.collaborationType] ?? "colaboración"}${destination}.`;
    const received = items.filter(i => Number(i.receivedQuantity) > 0).slice(0, 5)
      .map(i => `${Number(i.receivedQuantity).toLocaleString("es-PE")} ${i.unit} de ${i.product}`).join(", ");
    if (d.collaborationType === "productos" && received) contribution += ` Recibimos: ${received}.`;
  }
  return { kind: "donation", id: d.id, title: "¡Un nuevo aporte para seguir ayudando!", summary: `${contribution} ${thanks}`,
    imageUrl: d.campaignImage, path: d.campaignId ? `/campanas/${d.campaignId}/transparencia` : "/transparencia" };
}

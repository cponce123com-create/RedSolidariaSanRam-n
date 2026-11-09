import type { FacebookContent } from "./facebook-publisher";

interface DonationAnnouncement {
  id: number; amount: string | number; collaborationType: string;
  campaignId: number | null; campaignTitle: string | null; campaignImage: string | null;
  recognitionName: string | null;
  publicationImageUrl?: string | null;
  publicationTemplate?: string | null;
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
  const templates: Record<string, { title: string; closing: string }> = {
    agradecimiento: { title: "¡Un nuevo aporte para seguir ayudando!", closing: "" },
    impacto: { title: "Tu solidaridad se convierte en ayuda", closing: "Cada aporte nos permite seguir trabajando por nuestra comunidad." },
    comunidad: { title: "¡Juntos hacemos crecer la solidaridad!", closing: "Sigamos sumando esfuerzos por San Ramón. Conoce la campaña y cómo ayudar en nuestra web." },
  };
  const template = templates[d.publicationTemplate ?? ""] ?? templates.agradecimiento;
  return { kind: "donation", id: d.id, title: template.title, summary: [contribution, thanks, template.closing].filter(Boolean).join(" "),
    imageUrl: d.publicationImageUrl || d.campaignImage, path: d.campaignId ? `/campanas/${d.campaignId}/transparencia` : "/transparencia" };
}

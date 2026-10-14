/**
 * Resultados y rendición final de una campaña (Fase 2 del Prompt Maestro).
 *
 * REUTILIZA `campaign_evidence` (evidencias públicas) como base de los
 * resultados: fotografías y videos que documentan la ejecución. No se crean
 * tablas ni campos nuevos; el admin ya marca cada evidencia como pública
 * (`isPublic`) desde el panel.
 *
 * La rendición económica (recaudado/gastado/saldo) vive en el panel de
 * transparencia; aquí solo se resumen las evidencias y el % de ejecución.
 *
 * Funciones PURAS y testeables.
 */

export interface EvidenceItem {
  id: number;
  title?: string | null;
  description?: string | null;
  mediaUrl: string;
  mediaType?: string | null;
  evidenceType?: string | null;
  date?: string | null;
}

export interface ResultsSummary {
  total: number;
  images: number;
  videos: number;
}

/** Una evidencia es video cuando su `mediaType` es "video" (cualquier caja). */
export function isVideoEvidence(item: Pick<EvidenceItem, "mediaType">): boolean {
  return (item.mediaType ?? "").trim().toLowerCase() === "video";
}

/** Resumen verificable de los resultados publicados. */
export function summarizeEvidence(
  items: readonly EvidenceItem[] | undefined | null,
): ResultsSummary {
  const list = items ?? [];
  const videos = list.filter(isVideoEvidence).length;
  return { total: list.length, videos, images: list.length - videos };
}

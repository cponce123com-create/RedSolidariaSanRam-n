import { readFile } from "node:fs/promises";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import QRCode from "qrcode";
import { toWinAnsi } from "./pdf-closure-report";

/**
 * CERTIFICADO EN PDF (V14, Entrega 3) — generación real en el servidor.
 *
 * A diferencia del informe de cierre (información financiera INTERNA, cuyo QR apunta al
 * panel), el certificado está pensado para COMPARTIRSE: se entrega a un donante o a un
 * voluntario y cualquiera debe poder comprobar que es auténtico. Por eso su QR apunta a
 * la verificación PÚBLICA (`GET /certificates/:code`).
 *
 * REGLA QUE NO SE NEGOCIA: un certificado REVOCADO se sigue pudiendo descargar, pero
 * sale marcado como ANULADO, con su motivo. Si el PDF de un certificado revocado
 * pareciera válido, la revocación no serviría de nada: quien lo tuviera impreso podría
 * seguir usándolo.
 */

const ACCENT = rgb(0.15, 0.39, 0.32);
const DANGER = rgb(0.68, 0.15, 0.15);
const GOLD = rgb(0.68, 0.55, 0.25);

// Mantiene la proporción 3:2 de la plantilla original para que no se deforme.
const CERTIFICATE_PAGE: [number, number] = [841.89, (841.89 * 1024) / 1536];
const CHOCOFEST_TEMPLATE = new URL("./assets/certificate-chocofest-2026.jpg", import.meta.url);

export interface CertificatePdfInput {
  code: string;
  holderName: string;
  title: string;
  description: string | null;
  type: string;
  issuedAt: string;
  status: string;
  revokedAt: Date | string | null;
  revocationReason: string | null;
  /** URL pública de verificación (va también en el QR). */
  verificationUrl: string;
  orgName?: string;
}

export interface CertificatePdfResult {
  bytes: Uint8Array;
  filename: string;
}

function formatDate(value: Date | string | null): string {
  if (value === null) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return toWinAnsi(String(value));
  return date.toISOString().slice(0, 10);
}

/** ¿Está revocado? La revocación se reconoce por estado o por fecha de revocación. */
export function isRevokedCertificate(input: Pick<CertificatePdfInput, "status" | "revokedAt">): boolean {
  return input.status === "revoked" || input.revokedAt !== null;
}

export async function renderCertificatePdf(input: CertificatePdfInput): Promise<CertificatePdfResult> {
  const orgName = input.orgName ?? "Red Solidaria San Ramon";
  const revoked = isRevokedCertificate(input);

  const doc = await PDFDocument.create();
  doc.setTitle(toWinAnsi(`${input.title} - ${input.holderName}`));
  doc.setProducer(toWinAnsi(orgName));
  doc.setCreator("Panel administrativo");
  doc.setSubject(toWinAnsi(`Certificado ${input.code}`));

  const page = doc.addPage(CERTIFICATE_PAGE);
  const { width, height } = page.getSize();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const margin = 28;

  // Plantilla ChocoFest 2026 proporcionada por la organización. Conservamos
  // su proporción 3:2 y resolución; el nombre y el QR van en los espacios vacíos.
  const templateBytes = await readFile(CHOCOFEST_TEMPLATE);
  const template = await doc.embedJpg(templateBytes);
  page.drawImage(template, { x: 0, y: 0, width, height });

  // Coordenadas medidas sobre la plantilla 1536×1024, convertidas a puntos.
  // El QR llena el recuadro blanco reservado del sello de verificación.
  const imageScale = width / 1536;
  const holderArea = {
    x: 454 * imageScale,
    y: height - 583 * imageScale,
    width: (1082 - 454) * imageScale,
    height: (583 - 519) * imageScale,
  };
  const qrSize = 138 * imageScale;
  const qrCenterX = 1342 * imageScale;
  const qrCenterY = height - 704 * imageScale;
  const qrX = qrCenterX - qrSize / 2;
  const qrY = qrCenterY - qrSize / 2;

  const safeHolder = toWinAnsi(input.holderName);
  let holderSize = 27;
  while (holderSize > 13 && bold.widthOfTextAtSize(safeHolder, holderSize) > holderArea.width) {
    holderSize -= 1;
  }
  page.drawText(safeHolder, {
    x: holderArea.x + Math.max(0, (holderArea.width - bold.widthOfTextAtSize(safeHolder, holderSize)) / 2),
    y: holderArea.y + (holderArea.height - holderSize) / 2,
    size: holderSize,
    font: bold,
    color: ACCENT,
  });

  const qrPng = await QRCode.toBuffer(input.verificationUrl, {
    type: "png",
    width: 840,
    margin: 1,
    errorCorrectionLevel: "H",
  });
  const qrImage = await doc.embedPng(qrPng);
  page.drawImage(qrImage, { x: qrX, y: qrY, width: qrSize, height: qrSize });

  const centerX = width / 2;
  // ─── Sello de ANULADO ──────────────────────────────────────────────────────
  if (revoked) {
    // Se dibuja en diagonal, en grande y sin ambigüedad: quien tenga el papel impreso
    // debe ver de un vistazo que ya no vale.
    const stamp = "ANULADO";
    const stampSize = 76;
    const stampWidth = bold.widthOfTextAtSize(stamp, stampSize);
    page.drawText(stamp, {
      x: centerX - stampWidth / 2,
      y: height / 2 - 30,
      size: stampSize,
      font: bold,
      color: DANGER,
      opacity: 0.28,
      rotate: { type: "degrees", angle: 18 } as never,
    });
    const revokedText = toWinAnsi(`Certificado anulado el ${formatDate(input.revokedAt)}`);
    page.drawText(revokedText, {
      x: centerX - bold.widthOfTextAtSize(revokedText, 10) / 2,
      y: margin + 108,
      size: 10,
      font: bold,
      color: DANGER,
    });
    if (input.revocationReason) {
      const reason = toWinAnsi(`Motivo: ${input.revocationReason}`);
      page.drawText(reason, {
        x: centerX - bold.widthOfTextAtSize(reason, 9) / 2,
        y: margin + 94,
        size: 9,
        font: bold,
        color: DANGER,
      });
    }
  }

  const bytes = await doc.save();
  const filename = `certificado-${input.code}${revoked ? "-anulado" : ""}.pdf`;
  return { bytes, filename };
}

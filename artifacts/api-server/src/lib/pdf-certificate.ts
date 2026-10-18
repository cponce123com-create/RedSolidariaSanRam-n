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

const A4_LANDSCAPE: [number, number] = [841.89, 595.28];
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

  const page = doc.addPage(A4_LANDSCAPE);
  const { width, height } = page.getSize();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const margin = 34;

  // Plantilla ChocoFest 2026 proporcionada por la organización. Se ajusta a A4
  // horizontal para impresión; el nombre y el QR ocupan el recuadro vacío.
  const templateBytes = await readFile(CHOCOFEST_TEMPLATE);
  const template = await doc.embedJpg(templateBytes);
  page.drawImage(template, { x: 0, y: 0, width, height });

  const qrSize = 47;
  const qrX = width * 0.816;
  const qrY = height * 0.425;
  const holderArea = { x: width * 0.37, y: height * 0.45, width: width * 0.43 };

  const safeHolder = toWinAnsi(input.holderName);
  let holderSize = 24;
  while (holderSize > 13 && bold.widthOfTextAtSize(safeHolder, holderSize) > holderArea.width) {
    holderSize -= 1;
  }
  page.drawText(safeHolder, {
    x: holderArea.x + Math.max(0, (holderArea.width - bold.widthOfTextAtSize(safeHolder, holderSize)) / 2),
    y: holderArea.y,
    size: holderSize,
    font: bold,
    color: ACCENT,
  });

  const qrPng = await QRCode.toBuffer(input.verificationUrl, { type: "png", width: 320, margin: 1 });
  const qrImage = await doc.embedPng(qrPng);
  page.drawRectangle({
    x: qrX - 3,
    y: qrY - 3,
    width: qrSize + 6,
    height: qrSize + 6,
    color: rgb(1, 1, 1),
  });
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

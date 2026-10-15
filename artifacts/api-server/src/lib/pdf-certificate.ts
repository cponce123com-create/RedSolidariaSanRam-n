import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
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

const INK = rgb(0.11, 0.13, 0.16);
const MUTED = rgb(0.44, 0.47, 0.52);
const ACCENT = rgb(0.15, 0.39, 0.32);
const GOLD = rgb(0.68, 0.55, 0.25);
const DANGER = rgb(0.68, 0.15, 0.15);
const PAPER = rgb(0.99, 0.98, 0.96);

const A4_LANDSCAPE: [number, number] = [841.89, 595.28];

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

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
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
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const italic = await doc.embedFont(StandardFonts.HelveticaOblique);
  const margin = 34;

  // Fondo y doble marco: el documento se ve como un certificado, no como un informe.
  page.drawRectangle({ x: 0, y: 0, width, height, color: PAPER });
  page.drawRectangle({
    x: margin,
    y: margin,
    width: width - margin * 2,
    height: height - margin * 2,
    borderColor: GOLD,
    borderWidth: 2,
  });
  page.drawRectangle({
    x: margin + 6,
    y: margin + 6,
    width: width - margin * 2 - 12,
    height: height - margin * 2 - 12,
    borderColor: GOLD,
    borderWidth: 0.5,
  });

  const centerX = width / 2;
  const centered = (text: string, font: PDFFont, size: number, y: number, color = INK) => {
    const safe = toWinAnsi(text);
    page.drawText(safe, { x: centerX - font.widthOfTextAtSize(safe, size) / 2, y, size, font, color });
  };

  // ─── Encabezado ────────────────────────────────────────────────────────────
  centered(orgName.toUpperCase(), bold, 13, height - 78, ACCENT);
  centered("Otorga el presente", regular, 10, height - 96, MUTED);

  // ─── Título y destinatario ─────────────────────────────────────────────────
  const titleLines = wrap(toWinAnsi(input.title), bold, 26, width - margin * 2 - 120);
  let y = height - 140;
  for (const line of titleLines.slice(0, 2)) {
    centered(line, bold, 26, y, INK);
    y -= 32;
  }
  y -= 4;
  centered("a", italic, 11, y, MUTED);
  y -= 30;
  const holderLines = wrap(toWinAnsi(input.holderName), bold, 22, width - margin * 2 - 160);
  for (const line of holderLines.slice(0, 2)) {
    centered(line, bold, 22, y, ACCENT);
    y -= 27;
  }
  // Línea bajo el nombre, como en un certificado impreso.
  page.drawLine({
    start: { x: centerX - 200, y: y + 12 },
    end: { x: centerX + 200, y: y + 12 },
    thickness: 0.5,
    color: GOLD,
  });

  // ─── Descripción ───────────────────────────────────────────────────────────
  if (input.description) {
    y -= 14;
    for (const line of wrap(toWinAnsi(input.description), regular, 10, width - margin * 2 - 200).slice(0, 4)) {
      centered(line, regular, 10, y, INK);
      y -= 14;
    }
  }

  // ─── Pie: fecha, código y verificación ─────────────────────────────────────
  const footerY = margin + 62;
  page.drawText(toWinAnsi(`Emitido el ${formatDate(input.issuedAt)}`), {
    x: margin + 40,
    y: footerY,
    size: 9,
    font: regular,
    color: MUTED,
  });
  page.drawText(toWinAnsi(`Código: ${input.code}`), {
    x: margin + 40,
    y: footerY - 13,
    size: 9,
    font: bold,
    color: INK,
  });
  page.drawText(toWinAnsi(`Tipo: ${input.type}`), {
    x: margin + 40,
    y: footerY - 26,
    size: 8,
    font: regular,
    color: MUTED,
  });

  const qrSize = 74;
  const qrX = width - margin - 40 - qrSize;
  try {
    const qrPng = await QRCode.toBuffer(input.verificationUrl, { type: "png", width: 320, margin: 1 });
    const qrImage = await doc.embedPng(qrPng);
    page.drawImage(qrImage, { x: qrX, y: footerY - 22, width: qrSize, height: qrSize });
    page.drawText("Comprueba su autenticidad", {
      x: qrX - 4,
      y: footerY + qrSize - 16,
      size: 7.5,
      font: regular,
      color: MUTED,
    });
  } catch {
    page.drawText("Verifica en la web", { x: qrX, y: footerY + 20, size: 8, font: regular, color: MUTED });
  }
  page.drawText(toWinAnsi(input.verificationUrl), {
    x: margin + 40,
    y: margin + 40,
    size: 7.5,
    font: regular,
    color: ACCENT,
  });

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
    page.drawText(toWinAnsi(`Certificado anulado el ${formatDate(input.revokedAt)}`), {
      x: centerX - regular.widthOfTextAtSize(toWinAnsi(`Certificado anulado el ${formatDate(input.revokedAt)}`), 10) / 2,
      y: margin + 108,
      size: 10,
      font: bold,
      color: DANGER,
    });
    if (input.revocationReason) {
      const reason = toWinAnsi(`Motivo: ${input.revocationReason}`);
      page.drawText(reason, {
        x: centerX - regular.widthOfTextAtSize(reason, 9) / 2,
        y: margin + 94,
        size: 9,
        font: regular,
        color: DANGER,
      });
    }
  }

  const bytes = await doc.save();
  const filename = `certificado-${input.code}${revoked ? "-anulado" : ""}.pdf`;
  return { bytes, filename };
}

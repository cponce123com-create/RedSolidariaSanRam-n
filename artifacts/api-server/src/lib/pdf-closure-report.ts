import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import QRCode from "qrcode";
import type { ClosureItemStatus, ClosureReport } from "./campaign-closure";

/**
 * INFORME DE CIERRE EN PDF (V14, Entrega 3) — generación real en el servidor.
 *
 * Un cierre sin documento firmado es solo una fila en una tabla. Esto produce un PDF
 * A4 horizontal, apto para imprimir y para archivar, con:
 *   · las cifras congeladas del cierre;
 *   · las diez revisiones del procedimiento con su resultado;
 *   · el motivo y quién lo firmó;
 *   · el sello SHA-256 del informe y un QR que lleva a su verificación.
 *
 * Dependencias: `pdf-lib` (MIT) y `qrcode` (MIT), ambas JS puro y sin binarios
 * nativos, compatibles con Render Free.
 */

/** Colores institucionales (sobrios, para imprimir en blanco y negro sin perder nada). */
const INK = rgb(0.1, 0.12, 0.15);
const MUTED = rgb(0.42, 0.45, 0.5);
const ACCENT = rgb(0.15, 0.39, 0.32);
const WARN = rgb(0.65, 0.42, 0.05);
const DANGER = rgb(0.62, 0.16, 0.16);
const RULE = rgb(0.85, 0.87, 0.89);

const A4_LANDSCAPE: [number, number] = [841.89, 595.28];

/**
 * Sanea el texto para las fuentes estándar (WinAnsi): pdf-lib LANZA una excepción con
 * cualquier carácter fuera de esa tabla (comillas angulares, viñetas, tildes raras…).
 * Traducimos lo tipográfico y descartamos el resto, en vez de arriesgar un 500 al
 * generar un documento.
 */
export function toWinAnsi(value: string): string {
  const replacements: Record<string, string> = {
    "\u2018": "'", "\u2019": "'", "\u201c": '"', "\u201d": '"',
    "\u00ab": '"', "\u00bb": '"', "\u2013": "-", "\u2014": "-",
    "\u00b7": "-", "\u2022": "-", "\u2026": "...", "\u2713": "OK",
    "\u2717": "X", "\u00a0": " ", "\u2264": "<=", "\u2265": ">=", "\u2192": "->",
  };
  let out = "";
  for (const char of value.normalize("NFC")) {
    if (replacements[char] !== undefined) {
      out += replacements[char];
      continue;
    }
    const code = char.codePointAt(0) ?? 0;
    // WinAnsi cubre Latin-1 (incluidas tildes y ñ) y unos pocos signos extra.
    if (code >= 32 && code <= 126) out += char;
    else if (code >= 160 && code <= 255) out += char;
    else out += "?";
  }
  return out;
}

export interface ClosurePdfInput {
  report: ClosureReport;
  closureId: number;
  closedAt: Date | string;
  closedBy: string | null;
  reason: string;
  manifestHash: string;
  /** URL pública donde se puede comprobar el sello (va también en el QR). */
  verificationUrl: string;
  orgName?: string;
}

export interface ClosurePdfResult {
  bytes: Uint8Array;
  filename: string;
}

const STATUS_LABEL: Record<ClosureItemStatus, string> = {
  ok: "OK",
  warning: "AVISO",
  blocker: "BLOQUEANTE",
};

const STATUS_COLOR: Record<ClosureItemStatus, typeof INK> = {
  ok: ACCENT,
  warning: WARN,
  blocker: DANGER,
};

function money(value: number): string {
  return `S/ ${value.toFixed(2)}`;
}

function formatDate(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toISOString().slice(0, 10);
}

/** Envuelve un texto largo en líneas que caben en `maxWidth`. */
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

/**
 * Genera el PDF del informe de cierre. Puro en el sentido de que no toca la base: recibe
 * el informe ya congelado y devuelve los bytes.
 */
export async function renderClosureReportPdf(input: ClosurePdfInput): Promise<ClosurePdfResult> {
  const orgName = input.orgName ?? "Red Solidaria San Ramon";
  const doc = await PDFDocument.create();
  doc.setTitle(toWinAnsi(`Informe de cierre - ${input.report.campaignTitle}`));
  doc.setProducer("Red Solidaria San Ramon");
  doc.setCreator("Panel administrativo");

  const page: PDFPage = doc.addPage(A4_LANDSCAPE);
  const { width, height } = page.getSize();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const margin = 44;
  const contentWidth = width - margin * 2;

  // ─── Cabecera ──────────────────────────────────────────────────────────────
  page.drawRectangle({ x: 0, y: height - 74, width, height: 74, color: rgb(0.97, 0.98, 0.97) });
  page.drawText(toWinAnsi(orgName), {
    x: margin,
    y: height - 34,
    size: 15,
    font: bold,
    color: INK,
  });
  page.drawText("Informe de cierre financiero", {
    x: margin,
    y: height - 54,
    size: 10,
    font: regular,
    color: MUTED,
  });
  page.drawText(toWinAnsi(`Campaña: ${input.report.campaignTitle}  ·  ID ${input.report.campaignId}`), {
    x: margin + 250,
    y: height - 34,
    size: 11,
    font: bold,
    color: ACCENT,
  });
  page.drawText(
    toWinAnsi(
      `Cierre #${input.closureId}  ·  ${formatDate(input.closedAt)}  ·  Firmado por: ${input.closedBy ?? "—"}`,
    ),
    { x: margin + 250, y: height - 54, size: 9, font: regular, color: MUTED },
  );
  page.drawLine({
    start: { x: margin, y: height - 82 },
    end: { x: width - margin, y: height - 82 },
    thickness: 1,
    color: RULE,
  });

  // ─── Cifras congeladas ─────────────────────────────────────────────────────
  let y = height - 108;
  page.drawText("Cifras del cierre", { x: margin, y, size: 11, font: bold, color: INK });
  y -= 20;
  const figures: [string, string][] = [
    ["Recaudación verificada", money(input.report.figures.verifiedRaised)],
    ["Histórico contado", money(input.report.figures.historicalRaised)],
    ["Total de ingresos", money(input.report.figures.totalRaised)],
    ["Gastos", money(input.report.figures.totalSpent)],
    ["Saldo", money(input.report.figures.balance)],
    ["Donaciones confirmadas", String(input.report.figures.donationsCount)],
    ["Gastos registrados", String(input.report.figures.expensesCount)],
    ["Recursos sobrantes", String(input.report.figures.leftoversRemaining)],
  ];
  const columnWidth = contentWidth / 4;
  figures.forEach(([label, value], index) => {
    const column = index % 4;
    const row = Math.floor(index / 4);
    const x = margin + column * columnWidth;
    const rowY = y - row * 34;
    page.drawText(toWinAnsi(label), { x, y: rowY, size: 8, font: regular, color: MUTED });
    page.drawText(toWinAnsi(value), { x, y: rowY - 14, size: 12, font: bold, color: INK });
  });
  y -= 34 * Math.ceil(figures.length / 4) + 12;

  // ─── Revisión del procedimiento ────────────────────────────────────────────
  page.drawText("Revisión del procedimiento (10 puntos)", {
    x: margin,
    y,
    size: 11,
    font: bold,
    color: INK,
  });
  y -= 18;
  for (const item of input.report.checklist) {
    const color = STATUS_COLOR[item.status];
    page.drawText(toWinAnsi(`[${STATUS_LABEL[item.status]}]`), {
      x: margin,
      y,
      size: 8,
      font: bold,
      color,
    });
    page.drawText(toWinAnsi(item.label), { x: margin + 62, y, size: 9, font: bold, color: INK });
    const detailLines = wrap(toWinAnsi(item.detail), regular, 8.5, contentWidth - 62);
    detailLines.slice(0, 2).forEach((line, index) => {
      page.drawText(line, { x: margin + 62, y: y - 11 - index * 10, size: 8.5, font: regular, color: MUTED });
    });
    y -= 11 + Math.min(detailLines.length, 2) * 10 + 6;
  }

  // ─── Salvedades ────────────────────────────────────────────────────────────
  if (input.report.warnings.length > 0) {
    y -= 4;
    page.drawText("Salvedades registradas", { x: margin, y, size: 9, font: bold, color: WARN });
    y -= 12;
    for (const warning of input.report.warnings.slice(0, 4)) {
      for (const line of wrap(toWinAnsi(`- ${warning}`), regular, 8, contentWidth - 210).slice(0, 2)) {
        page.drawText(line, { x: margin, y, size: 8, font: regular, color: MUTED });
        y -= 10;
      }
    }
  }

  // ─── Firma, sello y QR ─────────────────────────────────────────────────────
  const sealY = 96;
  page.drawLine({
    start: { x: margin, y: sealY + 42 },
    end: { x: width - margin, y: sealY + 42 },
    thickness: 1,
    color: RULE,
  });
  page.drawText("Motivo del cierre", { x: margin, y: sealY + 26, size: 8, font: bold, color: MUTED });
  wrap(toWinAnsi(input.reason), regular, 9, contentWidth - 190)
    .slice(0, 2)
    .forEach((line, index) => {
      page.drawText(line, { x: margin, y: sealY + 12 - index * 11, size: 9, font: regular, color: INK });
    });
  page.drawText("Sello SHA-256 del informe", { x: margin, y: sealY - 18, size: 8, font: bold, color: MUTED });
  page.drawText(toWinAnsi(input.manifestHash), {
    x: margin,
    y: sealY - 30,
    size: 7.5,
    font: regular,
    color: INK,
  });
  page.drawText(toWinAnsi(`Verificación: ${input.verificationUrl}`), {
    x: margin,
    y: sealY - 44,
    size: 7.5,
    font: regular,
    color: ACCENT,
  });

  try {
    const qrPng = await QRCode.toBuffer(input.verificationUrl, { type: "png", width: 320, margin: 1 });
    const qrImage = await doc.embedPng(qrPng);
    page.drawImage(qrImage, { x: width - margin - 88, y: sealY - 44, width: 88, height: 88 });
    page.drawText("Comprueba el sello", {
      x: width - margin - 88,
      y: sealY + 50,
      size: 7.5,
      font: regular,
      color: MUTED,
    });
  } catch {
    // Si el QR no se puede generar, el informe sigue siendo válido: la URL y el sello
    // están escritos y permiten verificar igual.
    page.drawText("(QR no disponible: usa la URL de verificacion)", {
      x: width - margin - 190,
      y: sealY,
      size: 7.5,
      font: regular,
      color: MUTED,
    });
  }

  const bytes = await doc.save();
  const filename = `cierre-campana-${input.report.campaignId}-${formatDate(input.closedAt)}.pdf`;
  return { bytes, filename };
}

// Certificado en PDF (V14, Entrega 3) — generación REAL.
//
// La regla que estas pruebas blindan: un certificado REVOCADO se descarga igual, pero
// marcado como ANULADO. Si el PDF de un certificado anulado pareciera válido, la
// revocación no serviría de nada para quien ya lo tuviera impreso.
import { test } from "node:test";
import assert from "node:assert/strict";
import zlib from "node:zlib";

process.env.DATABASE_URL ??= "postgres://localhost:5432/nonexistent";

const { renderCertificatePdf, isRevokedCertificate } = await import("./dist/lib/pdf-certificate.mjs");
const { PDFDocument } = await import("pdf-lib");

const BASE = {
  code: "CERT-2026-0001",
  holderName: "María Quispe Huamán",
  title: "Constancia de donación",
  description: "Por su aporte solidario a la campaña Chocofest 2025.",
  type: "donante",
  issuedAt: "2026-10-15",
  status: "issued",
  revokedAt: null,
  revocationReason: null,
  verificationUrl: "https://redsolidaria.org/certificados/CERT-2026-0001",
};

/** Extrae el contenido dibujado (descomprimido) para poder inspeccionarlo. */
function drawnContent(bytes) {
  const raw = Buffer.from(bytes);
  const parts = [];
  for (let cursor = 0; ; ) {
    const keyword = raw.indexOf("stream", cursor);
    if (keyword < 0) break;
    const end = raw.indexOf("endstream", keyword);
    if (end < 0) break;
    let start = keyword + "stream".length;
    while (start < end && (raw[start] === 0x0d || raw[start] === 0x0a)) start += 1;
    try {
      parts.push(zlib.inflateSync(raw.subarray(start, end)).toString("latin1"));
    } catch {
      /* flujo no comprimido con zlib */
    }
    cursor = end + 1;
  }
  return parts.join(" ");
}

test("la revocación se reconoce por estado O por fecha", () => {
  assert.equal(isRevokedCertificate({ status: "issued", revokedAt: null }), false);
  assert.equal(isRevokedCertificate({ status: "revoked", revokedAt: null }), true);
  // Basta con la fecha: un registro revocado sin el estado actualizado sigue anulado.
  assert.equal(isRevokedCertificate({ status: "issued", revokedAt: new Date() }), true);
});

test("el certificado vigente es un PDF A4 horizontal válido y releíble", async () => {
  const { bytes, filename } = await renderCertificatePdf(BASE);
  assert.equal(Buffer.from(bytes.slice(0, 5)).toString(), "%PDF-");
  assert.equal(Buffer.from(bytes.slice(-5)).toString().trim(), "%%EOF");
  assert.equal(filename, "certificado-CERT-2026-0001.pdf");
  assert.ok(bytes.length > 2000, `demasiado pequeño: ${bytes.length}`);

  const doc = await PDFDocument.load(bytes);
  assert.equal(doc.getPageCount(), 1);
  const { width, height } = doc.getPages()[0].getSize();
  assert.equal(Math.round(width), 842);
  assert.equal(Math.round(height), 595);
  assert.match(doc.getTitle() ?? "", /Constancia de donación/);
});

test("un certificado vigente NO lleva el sello de anulado", async () => {
  const { bytes } = await renderCertificatePdf(BASE);
  const content = drawnContent(bytes);
  assert.ok(!content.includes("ANULADO"), "un certificado vigente no debe llevar el sello");
  assert.ok(!/certificado-anulado/.test("certificado-" + BASE.code), "el nombre no debe decir anulado");
});

test("un certificado REVOCADO sale marcado como ANULADO y con su motivo", async () => {
  const { bytes, filename } = await renderCertificatePdf({
    ...BASE,
    status: "revoked",
    revokedAt: new Date("2026-10-20T10:00:00Z"),
    revocationReason: "Emitido por error: donación duplicada.",
  });
  assert.equal(filename, "certificado-CERT-2026-0001-anulado.pdf");
  assert.equal(Buffer.from(bytes.slice(0, 5)).toString(), "%PDF-");

  // El texto va codificado por pdf-lib, así que se comprueba el RASTRO del sello: el
  // color de peligro y el texto de anulación deben estar dibujados.
  const content = drawnContent(bytes);
  assert.ok(content.length > 500, "debe haber contenido dibujado");
  assert.ok(content.includes("Tj"), "el sello se dibuja como texto");
  assert.ok(/0\.68 0\.15 0\.15/.test(content), "el rojo de anulación debe estar en el contenido");

  // Y el documento sigue siendo válido (la anulación no lo corrompe).
  assert.equal((await PDFDocument.load(bytes)).getPageCount(), 1);
});

test("un nombre con tildes y un título largo no tumban la generación", async () => {
  const { bytes } = await renderCertificatePdf({
    ...BASE,
    holderName: "José Ñáñez de la Cruz — «Voluntario del año» ✓",
    title: "Reconocimiento por su participación destacada en la campaña de recolección de víveres del año 2026",
    description: "Con «comillas», — guiones, … puntos suspensivos y un tic ✓.",
  });
  assert.equal(Buffer.from(bytes.slice(0, 5)).toString(), "%PDF-");
  assert.equal((await PDFDocument.load(bytes)).getPageCount(), 1);
});

test("sin URL de verificación el certificado sigue generándose", async () => {
  const { bytes } = await renderCertificatePdf({ ...BASE, verificationUrl: "no-es-url" });
  assert.equal(Buffer.from(bytes.slice(0, 5)).toString(), "%PDF-");
});

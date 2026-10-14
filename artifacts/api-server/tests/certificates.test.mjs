// Certificados con QR: código público, proyección pública y revocación.
import { test } from "node:test";
import assert from "node:assert/strict";

const {
  CERTIFICATE_CODE_LENGTH,
  CERTIFICATE_STATUSES,
  CERTIFICATE_TYPES,
  canRevoke,
  findDuplicateCertificate,
  generateCertificateCode,
  isCertificateStatus,
  isCertificateType,
  isValidCertificateCode,
  normalizeCertificateCode,
  normalizeHolderName,
  publicCertificate,
  validateRevocation,
} = await import("./dist/lib/certificates.mjs");

test("catálogos: tipos y estados son los esperados", () => {
  assert.deepEqual([...CERTIFICATE_TYPES], [
    "donante",
    "voluntario",
    "auspiciador",
    "colaborador",
    "reconocimiento",
  ]);
  assert.deepEqual([...CERTIFICATE_STATUSES], ["issued", "revoked"]);
  assert.equal(isCertificateType("donante"), true);
  assert.equal(isCertificateType("inventado"), false);
  assert.equal(isCertificateStatus("revoked"), true);
  assert.equal(isCertificateStatus("pendiente"), false);
});

test("código: longitud y alfabeto sin caracteres ambiguos", () => {
  for (let i = 0; i < 50; i += 1) {
    const code = generateCertificateCode();
    assert.equal(code.length, CERTIFICATE_CODE_LENGTH);
    assert.match(code, /^[23456789BCDFGHJKMNPQRSTVWXZ]+$/);
    // Nunca 0/O/1/I/L ni vocales: se dicta por teléfono sin confundirse.
    assert.equal(/[01OILAEU]/.test(code), false, `código ambiguo: ${code}`);
  }
});

test("código: no se repite en 2000 generaciones", () => {
  const codes = new Set();
  for (let i = 0; i < 2000; i += 1) codes.add(generateCertificateCode());
  assert.equal(codes.size, 2000);
});

test("normalización: mayúsculas, espacios y guiones dan el mismo código", () => {
  const code = generateCertificateCode();
  const withDashes = `${code.slice(0, 4)}-${code.slice(4, 8)}-${code.slice(8)}`;
  assert.equal(normalizeCertificateCode(code.toLowerCase()), code);
  assert.equal(normalizeCertificateCode(`  ${withDashes} `), code);
  assert.equal(normalizeCertificateCode(code.split("").join(" ")), code);
  assert.equal(isValidCertificateCode(withDashes), true);
});

test("normalización: lo que no es un código se rechaza", () => {
  for (const bad of [undefined, null, "", "   ", 42, {}]) {
    assert.equal(normalizeCertificateCode(bad), null);
  }
  // Se normalizan (se quitan guiones y espacios) pero NO son códigos válidos.
  assert.equal(normalizeCertificateCode("ABC"), "ABC");
  assert.equal(isValidCertificateCode("ABC"), false); // longitud incorrecta
  assert.equal(normalizeCertificateCode("AAAA-AAAA-AAAA-A"), "AAAAAAAAAAAAA");
  assert.equal(isValidCertificateCode("AAAA-AAAA-AAAA-A"), false); // 13 caracteres
  assert.equal(isValidCertificateCode("OOOOOOOOOOOO"), false); // O no está en el alfabeto
  assert.equal(isValidCertificateCode(generateCertificateCode()), true);
});

test("proyección pública: solo los datos autorizados, sin id ni contacto", () => {
  const publicView = publicCertificate({
    code: "23456789BCDF",
    holderName: "María Quispe",
    type: "donante",
    title: "Certificado de agradecimiento",
    description: "  Por su aporte a la campaña  ",
    issuedAt: "2026-10-14",
    status: "issued",
  });
  assert.deepEqual(publicView, {
    code: "23456789BCDF",
    holderName: "María Quispe",
    type: "donante",
    title: "Certificado de agradecimiento",
    description: "Por su aporte a la campaña",
    issuedAt: "2026-10-14",
  });
});

test("proyección pública: un certificado revocado NO se publica", () => {
  assert.equal(
    publicCertificate({
      code: "23456789BCDF",
      holderName: "X",
      type: "donante",
      title: "T",
      issuedAt: "2026-01-01",
      status: "revoked",
    }),
    null,
  );
});

test("proyección pública: sin certificado tampoco hay nada que publicar", () => {
  assert.equal(publicCertificate(null), null);
  assert.equal(publicCertificate(undefined), null);
});

test("proyección pública: descripción vacía se normaliza a null", () => {
  const view = publicCertificate({
    code: "23456789BCDF",
    holderName: "X",
    type: "donante",
    title: "T",
    description: "   ",
    issuedAt: "2026-01-01",
    status: "issued",
  });
  assert.equal(view.description, null);
});

test("revocación: solo se revoca lo emitido, y una vez", () => {
  assert.equal(canRevoke("issued"), true);
  assert.equal(canRevoke("revoked"), false);
  assert.equal(canRevoke(undefined), false);
});

test("revocación: el motivo es obligatorio y con contenido", () => {
  for (const bad of [undefined, null, "", "   ", "no", 42, {}]) {
    const result = validateRevocation(bad);
    assert.equal(result.ok, false, `debería rechazar: ${JSON.stringify(bad)}`);
  }
  const ok = validateRevocation("  Emitido por error en el nombre  ");
  assert.equal(ok.ok, true);
  assert.equal(ok.reason, "Emitido por error en el nombre");
});

// Fase 5 (V7.1): protección contra certificados duplicados.
const cert = (id, holderName, type, campaignId, status = "issued") => ({
  id,
  code: `CODE${id}`,
  holderName,
  type,
  campaignId,
  status,
});

test("duplicados: normaliza el nombre del titular", () => {
  assert.equal(normalizeHolderName("  María   GÓMEZ "), "maría gómez");
  assert.equal(normalizeHolderName("Ana"), "ana");
});

test("duplicados: mismo titular, tipo y campaña vigente → se detecta", () => {
  const existing = [cert(1, "María Gómez", "donante", 5)];
  const dup = findDuplicateCertificate(existing, {
    holderName: "MARÍA  gómez",
    type: "donante",
    campaignId: 5,
  });
  assert.equal(dup?.id, 1);
  assert.equal(dup?.code, "CODE1");
});

test("duplicados: un certificado revocado NO bloquea emitir otro", () => {
  const existing = [cert(1, "María Gómez", "donante", 5, "revoked")];
  const dup = findDuplicateCertificate(existing, {
    holderName: "María Gómez",
    type: "donante",
    campaignId: 5,
  });
  assert.equal(dup, null);
});

test("duplicados: distinto tipo o distinta campaña no son duplicados", () => {
  const existing = [cert(1, "María Gómez", "donante", 5)];
  assert.equal(
    findDuplicateCertificate(existing, { holderName: "María Gómez", type: "voluntario", campaignId: 5 }),
    null,
  );
  assert.equal(
    findDuplicateCertificate(existing, { holderName: "María Gómez", type: "donante", campaignId: 6 }),
    null,
  );
  // Sin campaña se compara contra certificados sin campaña.
  assert.equal(
    findDuplicateCertificate(existing, { holderName: "María Gómez", type: "donante" }),
    null,
  );
});

test("duplicados: sin certificados previos no hay duplicado", () => {
  assert.equal(
    findDuplicateCertificate([], { holderName: "Ana", type: "colaborador", campaignId: null }),
    null,
  );
});

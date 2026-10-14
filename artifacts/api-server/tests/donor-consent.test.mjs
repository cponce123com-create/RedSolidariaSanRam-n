import { test } from "node:test";
import assert from "node:assert/strict";

const {
  CONSENT_SCOPES,
  CONSENT_VERSION,
  consentScopeLabel,
  consentState,
  isConsentScope,
  latestConsentMap,
  resolvePublicRecognition,
  validateConsentDecision,
} = await import("./dist/lib/donor-consent.mjs");

const decision = (scope, granted, at, extra = {}) => ({
  scope,
  granted,
  createdAt: at,
  version: CONSENT_VERSION,
  ...extra,
});

test("catálogo de alcances: nombre, comprobante y fotografía", () => {
  assert.deepEqual([...CONSENT_SCOPES], ["public_name", "public_proof", "public_photo"]);
  assert.equal(isConsentScope("public_name"), true);
  assert.equal(isConsentScope("public_amount"), false);
  assert.equal(isConsentScope(null), false);
  assert.equal(consentScopeLabel("public_photo"), "Autorizar el uso de fotografías en reconocimientos");
  assert.equal(consentScopeLabel("otro"), "otro");
});

test("latestConsentMap: gana la última decisión por alcance", () => {
  const map = latestConsentMap([
    decision("public_name", true, "2026-10-01T10:00:00Z"),
    decision("public_name", false, "2026-10-05T10:00:00Z"),
    decision("public_proof", true, "2026-10-02T10:00:00Z"),
  ]);
  assert.equal(map.public_name, false); // la revocación posterior gana
  assert.equal(map.public_proof, true);
  assert.equal(map.public_photo, undefined); // sin decisión registrada
});

test("latestConsentMap: ignora alcances desconocidos y no muta la entrada", () => {
  const rows = [
    decision("public_amount", true, "2026-10-01T10:00:00Z"),
    decision("public_name", true, "2026-10-02T10:00:00Z"),
  ];
  const copy = [...rows];
  const map = latestConsentMap(rows);
  assert.deepEqual(map, { public_name: true });
  assert.deepEqual(rows, copy);
});

test("consentState: estado vigente con versión, motivo y número de decisiones", () => {
  const state = consentState([
    decision("public_name", true, "2026-10-01T10:00:00Z", { version: "2026-01-v1" }),
    decision("public_name", false, "2026-10-05T10:00:00Z", {
      reason: "El donante pidió no aparecer",
      recordedBy: "admin",
    }),
  ]);
  assert.equal(state.length, 1);
  assert.equal(state[0].scope, "public_name");
  assert.equal(state[0].granted, false);
  assert.equal(state[0].reason, "El donante pidió no aparecer");
  assert.equal(state[0].recordedBy, "admin");
  assert.equal(state[0].decisions, 2);
  assert.equal(state[0].decidedAt, "2026-10-05T10:00:00.000Z");
});

// ─── Regla «la negativa gana» (reflejo en las vistas públicas) ───────────────

test("reconocimiento: sin consentimientos rige lo declarado al donar", () => {
  assert.deepEqual(
    resolvePublicRecognition({ anonymous: false, publicProof: false }),
    { publishName: true, publishProof: false, publishPhoto: false },
  );
  assert.deepEqual(
    resolvePublicRecognition({ anonymous: true, publicProof: true }),
    { publishName: false, publishProof: true, publishPhoto: true },
  );
});

test("reconocimiento: la revocación oculta el dato en la vista pública", () => {
  const revoked = resolvePublicRecognition({
    anonymous: false,
    publicProof: true,
    consents: { public_name: false, public_proof: false, public_photo: false },
  });
  assert.deepEqual(revoked, { publishName: false, publishProof: false, publishPhoto: false });
});

test("reconocimiento: otorgar NO revela un nombre declarado anónimo", () => {
  const granted = resolvePublicRecognition({
    anonymous: true,
    publicProof: false,
    consents: { public_name: true },
  });
  assert.equal(granted.publishName, false);
});

// ─── Validación de decisiones ────────────────────────────────────────────────

test("validateConsentDecision: alcance inválido y granted ausente se rechazan", () => {
  assert.equal(validateConsentDecision({ scope: "nope", granted: true }).ok, false);
  assert.equal(validateConsentDecision({ scope: "public_name" }).ok, false);
  assert.equal(validateConsentDecision({ scope: "public_name", granted: "si" }).ok, false);
});

test("validateConsentDecision: revocar exige motivo", () => {
  const noReason = validateConsentDecision({ scope: "public_name", granted: false });
  assert.equal(noReason.ok, false);
  assert.match(noReason.message, /motivo/);

  const short = validateConsentDecision({ scope: "public_name", granted: false, reason: "no" });
  assert.equal(short.ok, false);

  const ok = validateConsentDecision({
    scope: "public_name",
    granted: false,
    reason: "El donante pidió no aparecer",
  });
  assert.equal(ok.ok, true);
  assert.equal(ok.granted, false);
  assert.equal(ok.reason, "El donante pidió no aparecer");
  assert.equal(ok.version, CONSENT_VERSION);
});

test("validateConsentDecision: otorgar no exige motivo y acepta versión explícita", () => {
  const ok = validateConsentDecision({
    scope: "public_proof",
    granted: true,
    version: "2027-01-v2",
  });
  assert.equal(ok.ok, true);
  assert.equal(ok.reason, null);
  assert.equal(ok.version, "2027-01-v2");
});

// Validación de negocio del flujo de donación (schema + máquina de estados +
// URLs de comprobante). Contratos puros, sin DB.
import { test } from "node:test";
import assert from "node:assert/strict";

const {
  donationInputSchema,
  isAllowedTransition,
  approvalRequiresProof,
  isValidProofUrl,
} = await import("./dist/lib/donation-validation.mjs");

const VALID = {
  firstName: "María",
  lastName: "Quispe",
  email: "maria@example.com",
  amount: 50,
  paymentMethod: "yape",
};

test("donationInputSchema: donación válida pasa y anula el status del cliente", () => {
  const parsed = donationInputSchema.safeParse({
    ...VALID,
    status: "approved", // spoof: debe ignorarse (sin .strict() se descarta)
    campaignId: 1,
    message: "  ¡Gracias!  ",
  });
  assert.equal(parsed.success, true);
  if (!parsed.success) return;
  assert.equal(parsed.data.status, undefined); // no está en el contrato
  assert.equal(parsed.data.message, "¡Gracias!"); // trim
  assert.equal(parsed.data.adminNote, undefined);
  assert.equal(parsed.data.anonymous, undefined); // nullish → default en DB
});

test("donationInputSchema: rechaza montos inválidos (negativo, 0, >2 decimales)", () => {
  for (const amount of [-5, 0, 1, 4.99, 50.123, 50.001, 5.005]) {
    const r = donationInputSchema.safeParse({ ...VALID, amount });
    assert.equal(r.success, false, `amount ${amount} debería rechazarse`);
  }
  // Incluye montos con centavos: 5.01*100 = 500.99999999999994 en float64 y
  // una comparación exacta los rechazaría (regresión).
  for (const amount of [5, 5.01, 5.5, 10.1, 50, 50.01, 50.99, 100.5, 0.01 + 49.99]) {
    const r = donationInputSchema.safeParse({ ...VALID, amount });
    assert.equal(r.success, true, `amount ${amount} debería aceptarse`);
  }
});

test("donationInputSchema: rechaza email malo, método inválido y nombres cortos", () => {
  assert.equal(donationInputSchema.safeParse({ ...VALID, email: "no-es-email" }).success, false);
  assert.equal(donationInputSchema.safeParse({ ...VALID, email: "" }).success, false);
  assert.equal(donationInputSchema.safeParse({ ...VALID, paymentMethod: "yapeee" }).success, false);
  assert.equal(donationInputSchema.safeParse({ ...VALID, paymentMethod: "" }).success, false);
  assert.equal(donationInputSchema.safeParse({ ...VALID, firstName: "A" }).success, false);
  assert.equal(donationInputSchema.safeParse({ ...VALID, lastName: "" }).success, false);
  assert.equal(donationInputSchema.safeParse({ ...VALID, campaignId: -1 }).success, false);
  assert.equal(donationInputSchema.safeParse({ ...VALID, campaignId: 1.5 }).success, false);
});

test("isAllowedTransition: approved es terminal (ledger append-only)", () => {
  assert.equal(isAllowedTransition("pending", "approved"), true);
  assert.equal(isAllowedTransition("pending", "rejected"), true);
  assert.equal(isAllowedTransition("rejected", "pending"), true);
  assert.equal(isAllowedTransition("approved", "rejected"), false);
  assert.equal(isAllowedTransition("approved", "pending"), false);
  assert.equal(isAllowedTransition("rejected", "approved"), false);
  assert.equal(isAllowedTransition("pending", "pending"), false);
  assert.equal(isAllowedTransition("hacked", "approved"), false);
});

test("approvalRequiresProof: solo métodos digitales", () => {
  assert.equal(approvalRequiresProof("yape"), true);
  assert.equal(approvalRequiresProof("plin"), true);
  assert.equal(approvalRequiresProof("transfer"), true);
  assert.equal(approvalRequiresProof("cash"), false);
  assert.equal(approvalRequiresProof("card"), false);
  assert.equal(approvalRequiresProof("other"), false);
});

test("isValidProofUrl: solo https; con requireCloudinary exige el host de Cloudinary", () => {
  assert.equal(isValidProofUrl("https://res.cloudinary.com/demo/image/upload/v1/x.jpg"), true);
  assert.equal(isValidProofUrl("https://res.cloudinary.com/demo/image/upload/v1/x.jpg", { requireCloudinary: true }), true);
  assert.equal(isValidProofUrl("http://res.cloudinary.com/x.jpg"), false);
  assert.equal(isValidProofUrl("http://evil.com/x.jpg"), false);
  assert.equal(isValidProofUrl("javascript:alert(1)"), false);
  assert.equal(isValidProofUrl("data:image/svg+xml;base64,xxx"), false);
  assert.equal(isValidProofUrl("ftp://x.com/a.jpg"), false);
  assert.equal(isValidProofUrl("no-es-una-url"), false);
  assert.equal(isValidProofUrl(""), false);
  assert.equal(isValidProofUrl(null), false);
  assert.equal(isValidProofUrl(42), false);
  // Admin: https de cualquier host está permitido (sin requireCloudinary)
  assert.equal(isValidProofUrl("https://example.com/receipt.jpg"), true);
  // Donante: host distinto a Cloudinary → rechazado
  assert.equal(isValidProofUrl("https://example.com/receipt.jpg", { requireCloudinary: true }), false);
});

// ── Tipo de colaboración: dinero exige monto/comprobante; especie no ────────

test("donationInputSchema: donación en especie aceptada sin método de pago ni monto", () => {
  const productos = donationInputSchema.safeParse({
    ...VALID,
    collaborationType: "productos",
    amount: 0,
  });
  assert.equal(productos.success, true, "productos con amount 0 debería aceptarse");

  const servicios = donationInputSchema.safeParse({
    ...VALID,
    collaborationType: "servicios",
    amount: 0,
    paymentMethod: undefined,
  });
  assert.equal(servicios.success, true, "servicios sin paymentMethod debería aceptarse");

  // amount omitido: en especie el valor es un estimado opcional (cae a 0).
  const { amount: _omitido, ...sinMonto } = VALID;
  const logistica = donationInputSchema.safeParse({
    ...sinMonto,
    collaborationType: "logistica",
  });
  assert.equal(logistica.success, true, "logística sin amount debería aceptarse");
});

test("donationInputSchema: en especie el monto sigue validándose (negativo / >2 decimales)", () => {
  assert.equal(
    donationInputSchema.safeParse({ ...VALID, collaborationType: "productos", amount: -1 }).success,
    false,
  );
  assert.equal(
    donationInputSchema.safeParse({ ...VALID, collaborationType: "productos", amount: 10.123 }).success,
    false,
  );
});

test("donationInputSchema: dinero exige monto ≥ 5 y método de pago", () => {
  assert.equal(
    donationInputSchema.safeParse({ ...VALID, collaborationType: "dinero", amount: 0 }).success,
    false,
  );
  assert.equal(
    donationInputSchema.safeParse({ ...VALID, collaborationType: "dinero", paymentMethod: undefined }).success,
    false,
  );
  assert.equal(
    donationInputSchema.safeParse({ ...VALID, collaborationType: "dinero", paymentMethod: null }).success,
    false,
  );
  // Control: el mismo cuerpo sin collaborationType (→ dinero) también falla.
  assert.equal(donationInputSchema.safeParse({ ...VALID, amount: 0 }).success, false);
});

test("donationInputSchema: tipo de colaboración desconocido → rechazado", () => {
  assert.equal(
    donationInputSchema.safeParse({ ...VALID, collaborationType: "trueque" }).success,
    false,
  );
});

test("approvalRequiresProof: en especie nunca exige comprobante", () => {
  assert.equal(approvalRequiresProof("yape"), true);
  assert.equal(approvalRequiresProof("yape", "dinero"), true);
  assert.equal(approvalRequiresProof("yape", "productos"), false);
  assert.equal(approvalRequiresProof("transfer", "logistica"), false);
  assert.equal(approvalRequiresProof("cash", "dinero"), false);
  assert.equal(approvalRequiresProof("other", "productos"), false);
});

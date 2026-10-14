// Contacto por WhatsApp configurable (funciones puras, sin React ni red).
// Fase 7 del Prompt Maestro V7: el número y los mensajes viven en `settings`;
// si no hay número configurado NO se inventa uno.
import { test } from "node:test";
import assert from "node:assert/strict";

const {
  WHATSAPP_SETTING_KEYS,
  buildWhatsAppUrl,
  formatWhatsAppNumber,
  normalizeWhatsAppNumber,
  resolveWhatsAppContact,
} = await import("./dist/whatsapp.mjs");

test("claves públicas de WhatsApp: número y un mensaje por propósito", () => {
  assert.deepEqual(WHATSAPP_SETTING_KEYS, {
    number: "org_whatsapp",
    general: "whatsapp_message_general",
    donation: "whatsapp_message_donation",
    volunteer: "whatsapp_message_volunteer",
    sponsor: "whatsapp_message_sponsor",
  });
});

test("normalizeWhatsAppNumber: solo dígitos, acepta formato humano", () => {
  assert.equal(normalizeWhatsAppNumber("51921615737"), "51921615737");
  assert.equal(normalizeWhatsAppNumber("+51 921 615 737"), "51921615737");
  assert.equal(normalizeWhatsAppNumber("(51) 921-615-737"), "51921615737");
});

test("normalizeWhatsAppNumber: valores inválidos devuelven null (no se inventa)", () => {
  for (const value of [undefined, null, "", "   ", "12345", "12345678901234567890", 51921615737, {}, "no-es-numero"]) {
    assert.equal(normalizeWhatsAppNumber(value), null);
  }
});

test("formatWhatsAppNumber: prefijo de país y bloques de tres", () => {
  assert.equal(formatWhatsAppNumber("51921615737"), "+51 921 615 737");
  assert.equal(formatWhatsAppNumber("+51 921 615 737"), "+51 921 615 737");
  assert.equal(formatWhatsAppNumber(""), null);
});

test("buildWhatsAppUrl: sin mensaje no añade query", () => {
  assert.equal(buildWhatsAppUrl("51921615737"), "https://wa.me/51921615737");
  assert.equal(buildWhatsAppUrl("51921615737", "   "), "https://wa.me/51921615737");
});

test("buildWhatsAppUrl: el mensaje va codificado", () => {
  const url = buildWhatsAppUrl("51921615737", "Hola, quiero donar S/ 50 & más");
  assert.ok(url?.startsWith("https://wa.me/51921615737?text="));
  assert.ok(url?.includes("Hola%2C%20quiero%20donar%20S%2F%2050%20%26%20m%C3%A1s"));
});

test("buildWhatsAppUrl: sin número válido no hay enlace", () => {
  assert.equal(buildWhatsAppUrl("", "hola"), null);
  assert.equal(buildWhatsAppUrl("123", "hola"), null);
  assert.equal(buildWhatsAppUrl(undefined, "hola"), null);
});

test("resolveWhatsAppContact: el mensaje configurado gana al texto por defecto", () => {
  const settings = {
    org_whatsapp: "+51 921 615 737",
    whatsapp_message_donation: "Quiero donar al ChocoFest",
  };
  const contact = resolveWhatsAppContact(settings, "donation", "texto por defecto");
  assert.ok(contact);
  assert.equal(contact.number, "51921615737");
  assert.equal(contact.display, "+51 921 615 737");
  assert.equal(contact.url, "https://wa.me/51921615737?text=Quiero%20donar%20al%20ChocoFest");
});

test("resolveWhatsAppContact: sin mensaje configurado usa el del idioma", () => {
  const contact = resolveWhatsAppContact(
    { org_whatsapp: "51921615737", whatsapp_message_volunteer: "  " },
    "volunteer",
    "Quiero ser voluntario",
  );
  assert.ok(contact?.url.endsWith("?text=Quiero%20ser%20voluntario"));
});

test("resolveWhatsAppContact: sin número configurado no hay contacto", () => {
  assert.equal(resolveWhatsAppContact({}, "general", "hola"), null);
  assert.equal(resolveWhatsAppContact(undefined, "general", "hola"), null);
  assert.equal(resolveWhatsAppContact({ org_whatsapp: "000" }, "general", "hola"), null);
});

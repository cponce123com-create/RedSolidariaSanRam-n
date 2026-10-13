// Protagonismo de la campaña en la portada y acceso administrativo.
// Funciones puras: sin red, sin React, sin base de datos.
import { test } from "node:test";
import assert from "node:assert/strict";

const {
  PROTAGONIST_SETTING_KEY,
  parseProtagonistId,
  resolveProtagonist,
  prioritizeCampaign,
  excludeCampaign,
} = await import("./dist/chocofest.mjs");

const { resolveAdminTarget } = await import("./dist/admin-access.mjs");

const TODAY = new Date("2026-11-15T12:00:00.000Z");

// --- Acceso administrativo (visibilidad y navegación) ---

test("acceso admin: un visitante va al login con la etiqueta de acceso", () => {
  const target = resolveAdminTarget(false);
  assert.equal(target.href, "/admin/login");
  assert.equal(target.labelKey, "nav.adminAccess");
});

test("acceso admin: un administrador autenticado entra directo al panel", () => {
  const target = resolveAdminTarget(true);
  assert.equal(target.href, "/admin");
  assert.equal(target.labelKey, "nav.adminPanel");
});

// --- Identificador estable (no por título) ---

test("clave de settings del protagonista es estable", () => {
  assert.equal(PROTAGONIST_SETTING_KEY, "protagonist_campaign_id");
});

test("parseProtagonistId: acepta enteros positivos", () => {
  assert.equal(parseProtagonistId("7"), 7);
  assert.equal(parseProtagonistId(7), 7);
  assert.equal(parseProtagonistId("  12 "), 12);
});

test("parseProtagonistId: rechaza vacío, cero, negativos y no numéricos", () => {
  for (const value of [null, undefined, "", "   ", "0", 0, "-3", "abc", "1.5", "7px"]) {
    assert.equal(parseProtagonistId(value), null);
  }
});

// --- Sin campaña protagonista ---

test("resolveProtagonist: sin campaña configurada → portada general", () => {
  assert.equal(resolveProtagonist(undefined, TODAY), null);
  assert.equal(resolveProtagonist(null, TODAY), null);
});

test("resolveProtagonist: no publicada → portada general", () => {
  assert.equal(resolveProtagonist({ status: "paused" }, TODAY), null);
  assert.equal(resolveProtagonist({ status: "" }, TODAY), null);
});

// --- Campaña finalizada ---

test("resolveProtagonist: completada → portada general", () => {
  assert.equal(
    resolveProtagonist({ status: "completed", endDate: "2026-12-23" }, TODAY),
    null,
  );
});

test("resolveProtagonist: activa pero ya terminada → portada general", () => {
  assert.equal(resolveProtagonist({ status: "active", endDate: "2026-11-01" }, TODAY), null);
});

test("resolveProtagonist: activa y vigente → es la protagonista", () => {
  const campaign = { id: 7, status: "active", endDate: "2026-12-23" };
  assert.deepEqual(resolveProtagonist(campaign, TODAY), campaign);
});

test("resolveProtagonist: activa sin fecha de fin → es la protagonista", () => {
  const campaign = { id: 7, status: "active", endDate: null };
  assert.deepEqual(resolveProtagonist(campaign, TODAY), campaign);
});

test("resolveProtagonist: termina hoy → sigue siendo protagonista", () => {
  const campaign = { id: 7, status: "active", endDate: "2026-11-15" };
  assert.deepEqual(resolveProtagonist(campaign, TODAY), campaign);
});

// --- Orden y ausencia de duplicados ---

const LIST = [
  { id: 1, title: "Chocolatada 2024" },
  { id: 7, title: "ChocoFest 2026" },
  { id: 2, title: "Campaña Escolar 2025" },
];

test("prioritizeCampaign: coloca la protagonista en primer lugar", () => {
  const out = prioritizeCampaign(LIST, 7);
  assert.deepEqual(out.map((c) => c.id), [7, 1, 2]);
});

test("prioritizeCampaign: sin protagonista no altera el orden", () => {
  assert.deepEqual(prioritizeCampaign(LIST, null).map((c) => c.id), [1, 7, 2]);
});

test("prioritizeCampaign: id inexistente no altera el orden", () => {
  assert.deepEqual(prioritizeCampaign(LIST, 99).map((c) => c.id), [1, 7, 2]);
});

test("prioritizeCampaign: no duplica ni pierde campañas", () => {
  const out = prioritizeCampaign(LIST, 7);
  assert.equal(out.length, LIST.length);
  assert.equal(new Set(out.map((c) => c.id)).size, LIST.length);
});

test("excludeCampaign: quita la protagonista sin ocultar las demás", () => {
  assert.deepEqual(excludeCampaign(LIST, 7).map((c) => c.id), [1, 2]);
});

test("excludeCampaign: sin protagonista devuelve la lista completa", () => {
  assert.deepEqual(excludeCampaign(LIST, null).map((c) => c.id), [1, 7, 2]);
});

test("portada: el bloque protagonista y el listado no se solapan", () => {
  const protagonistId = 7;
  const protagonist = prioritizeCampaign(LIST, protagonistId)[0];
  const others = excludeCampaign(LIST, protagonistId);
  assert.equal(others.some((c) => c.id === protagonist.id), false);
  assert.equal(others.length + 1, LIST.length);
});

test("compatibilidad: las demás campañas siguen accesibles tras priorizar", () => {
  const out = prioritizeCampaign(LIST, 7);
  for (const original of LIST) {
    assert.equal(out.some((c) => c.id === original.id), true);
  }
});

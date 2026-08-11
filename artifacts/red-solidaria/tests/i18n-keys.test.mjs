import { test } from "node:test";
import assert from "node:assert/strict";
import { es } from "./dist/i18n/locales/es.mjs";
import { en } from "./dist/i18n/locales/en.mjs";

// --- Helpers ---------------------------------------------------------------

/** Devuelve todas las rutas de claves (arrays) hoja del objeto de traducciones. */
function collectKeys(obj, prefix = []) {
  const keys = [];
  for (const [k, v] of Object.entries(obj)) {
    const path = [...prefix, k];
    if (v && typeof v === "object" && !Array.isArray(v)) {
      keys.push(...collectKeys(v, path));
    } else {
      keys.push(path);
    }
  }
  return keys;
}

function getValue(obj, path) {
  return path.reduce((o, p) => o[p], obj);
}

/** Placeholders de interpolación {{x}} ordenados (para comparar conjuntos). */
function placeholders(str) {
  return (String(str).match(/\{\{(\w+)\}\}/g) || []).sort();
}

const esKeys = collectKeys(es);
const enKeys = collectKeys(en);
const esMap = new Map(esKeys.map((k) => [k.join("."), getValue(es, k)]));
const enMap = new Map(enKeys.map((k) => [k.join("."), getValue(en, k)]));

// --- Tests ------------------------------------------------------------------

test("i18n: toda clave de es existe en en (y viceversa)", () => {
  const esKeySet = new Set(esMap.keys());
  const enKeySet = new Set(enMap.keys());
  const missingInEn = [...esKeySet].filter((k) => !enKeySet.has(k));
  const extraInEn = [...enKeySet].filter((k) => !esKeySet.has(k));
  assert.deepEqual(missingInEn, [], `Claves faltantes en en: ${missingInEn.join(", ")}`);
  assert.deepEqual(extraInEn, [], `Claves que sobran en en: ${extraInEn.join(", ")}`);
});

test("i18n: misma cantidad de claves en ambos idiomas", () => {
  assert.equal(esMap.size, enMap.size);
});

test("i18n: interpolaciones {{x}} idénticas entre es y en", () => {
  const mismatches = [];
  for (const key of esMap.keys()) {
    const a = placeholders(esMap.get(key));
    const b = placeholders(enMap.get(key));
    if (a.join(",") !== b.join(",")) {
      mismatches.push(`${key}: es=${a.join("|")} vs en=${b.join("|")}`);
    }
  }
  assert.deepEqual(mismatches, []);
});

test("i18n: sin cadenas vacías ni claves sin traducir en en", () => {
  // Claves que LEGÍTIMAMENTE son idénticas en ambos idiomas (nombres propios,
  // marcas, datos bancarios, términos iguales en es/en). Añadir aquí solo con
  // intención: el test fuerza la decisión consciente de no traducir.
  const LEGIT_SHARED = new Set([
    "home.heroTitleWord1", // Red (nombre propio)
    "home.heroTitleWord2", // Solidaria (nombre propio)
    "home.heroTitleWord3", // San (nombre propio)
    "home.heroTitleWord4", // Ramón (nombre propio)
    "nav.brand", // Red Solidaria (nombre propio)
    "nav.brandLocation", // San Ramón
    "footer.brand", // Red Solidaria
    "footer.address", // San Ramón, Chanchamayo
    "seo.siteName", // Red Solidaria San Ramón
    "urgency.min", // Min (abreviatura idéntica)
    "share.whatsapp", // marca
    "share.facebook", // marca
    "donation.transferAccount", // BCP: 193-12345678-0-55 (dato)
    "donation.error", // Error (término igual en es/en)
    "contact.email", // contacto@redsolidariasanramon.org (dato)
    "imageUpload.placeholder", // https://... (dato)
    "volunteer.benefitFlexible", // Flexible (misma palabra en es/en)
    "stockCatalog.titleHighlight", // Stock (misma palabra en es/en)
  ]);

  const empty = [...enMap.entries()].filter(([, v]) => v === "").map(([k]) => k);
  const unchanged = [...enMap.entries()].filter(
    ([k, v]) => esMap.get(k) === v && /\p{L}/u.test(v) && !/\{\{/.test(v) && !LEGIT_SHARED.has(k),
  ).map(([k]) => k);
  assert.deepEqual(empty, [], `Claves vacías en en: ${empty.join(", ")}`);
  // Si es y en son idénticas en una clave con texto (fuera de la allowlist),
  // probablemente no se tradujo.
  assert.deepEqual(unchanged, [], `Claves sin traducir (es === en): ${unchanged.join(", ")}`);
});

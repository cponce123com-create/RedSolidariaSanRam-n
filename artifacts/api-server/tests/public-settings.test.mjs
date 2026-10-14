// Separación público/privado de la configuración (funciones puras, sin DB).
import { test } from "node:test";
import assert from "node:assert/strict";

const { PUBLIC_SETTING_KEYS, filterPublicSettings, isPublicSettingKey } = await import(
  "./dist/lib/public-settings.mjs"
);

test("allowlist: contiene las claves que consume el sitio público", () => {
  for (const key of [
    "protagonist_campaign_id",
    "chocofest_2026_place",
    "chocofest_2026_schedule",
    "chocofest_2026_motto",
  ]) {
    assert.equal(isPublicSettingKey(key), true, `${key} debería ser pública`);
  }
  assert.equal(PUBLIC_SETTING_KEYS.length, 4);
});

test("allowlist: el resto de configuraciones son PRIVADAS por defecto", () => {
  for (const key of [
    "donation_bcp",
    "donation_bcp_cci",
    "donation_yape",
    "org_email",
    "org_phone",
    "session_secret",
    "clave_nueva_desconocida",
  ]) {
    assert.equal(isPublicSettingKey(key), false, `${key} NO debería ser pública`);
  }
});

test("filterPublicSettings: solo devuelve claves de la allowlist", () => {
  const map = filterPublicSettings([
    { key: "protagonist_campaign_id", value: "7" },
    { key: "chocofest_2026_place", value: "Plaza de Armas" },
    { key: "donation_bcp", value: "193-12345678-0-55" },
    { key: "org_email", value: "contacto@redsolidariasanramon.org" },
    { key: "otra_clave", value: "x" },
  ]);
  assert.deepEqual(map, {
    protagonist_campaign_id: "7",
    chocofest_2026_place: "Plaza de Armas",
  });
});

test("filterPublicSettings: un valor nulo se normaliza a cadena vacía", () => {
  const map = filterPublicSettings([{ key: "chocofest_2026_motto", value: null }]);
  assert.deepEqual(map, { chocofest_2026_motto: "" });
});

test("filterPublicSettings: lista vacía → objeto vacío", () => {
  assert.deepEqual(filterPublicSettings([]), {});
});

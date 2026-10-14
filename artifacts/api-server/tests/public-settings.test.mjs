// Separación público/privado de la configuración (funciones puras, sin DB).
import { test } from "node:test";
import assert from "node:assert/strict";

const { PUBLIC_SETTING_KEYS, filterPublicSettings, isPublicSettingKey } = await import(
  "./dist/lib/public-settings.mjs"
);

// Las claves públicas del evento deben coincidir con las que edita el panel y
// consume el sitio (CHOCOFEST_SETTING_KEYS del frontend): esta lista es el
// contrato, y cualquier clave nueva queda privada hasta añadirla aquí.
const EXPECTED_PUBLIC_KEYS = [
  "protagonist_campaign_id",
  "chocofest_2026_place",
  "chocofest_2026_schedule",
  "chocofest_2026_motto",
  "chocofest_2026_objectives",
  "chocofest_2026_organizers",
  "chocofest_2026_program",
];

test("allowlist: contiene las claves que consume el sitio público", () => {
  for (const key of EXPECTED_PUBLIC_KEYS) {
    assert.equal(isPublicSettingKey(key), true, `${key} debería ser pública`);
  }
  assert.equal(PUBLIC_SETTING_KEYS.length, EXPECTED_PUBLIC_KEYS.length);
  assert.deepEqual([...PUBLIC_SETTING_KEYS].sort(), [...EXPECTED_PUBLIC_KEYS].sort());
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
    { key: "chocofest_2026_objectives", value: "Atender a los niños del distrito" },
    { key: "donation_bcp", value: "193-12345678-0-55" },
    { key: "org_email", value: "contacto@redsolidariasanramon.org" },
    { key: "otra_clave", value: "x" },
  ]);
  assert.deepEqual(map, {
    protagonist_campaign_id: "7",
    chocofest_2026_place: "Plaza de Armas",
    chocofest_2026_objectives: "Atender a los niños del distrito",
  });
});

test("filterPublicSettings: un valor nulo se normaliza a cadena vacía", () => {
  const map = filterPublicSettings([{ key: "chocofest_2026_motto", value: null }]);
  assert.deepEqual(map, { chocofest_2026_motto: "" });
});

test("filterPublicSettings: lista vacía → objeto vacío", () => {
  assert.deepEqual(filterPublicSettings([]), {});
});

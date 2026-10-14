/**
 * Separación público/privado de la configuración (Fase 4 del Prompt Maestro).
 *
 * `GET /api/settings` es PÚBLICO. Solo debe devolver las claves que el sitio
 * necesita mostrar; cualquier configuración nueva queda PRIVADA por defecto.
 * La lista es EXPLÍCITA: publicar una clave es una decisión consciente.
 *
 * El panel administrativo usa `GET /api/admin/settings`, que devuelve TODAS las
 * claves (incluidas las privadas).
 *
 * Funciones PURAS y testeables.
 */

export const PUBLIC_SETTING_KEYS = [
  // Portada: campaña protagonista (identificador estable).
  "protagonist_campaign_id",
  // Evento ChocoFest 2026: datos editables que se muestran al público.
  "chocofest_2026_place",
  "chocofest_2026_schedule",
  "chocofest_2026_motto",
] as const;

const PUBLIC_SETTING_SET: ReadonlySet<string> = new Set<string>(PUBLIC_SETTING_KEYS);

export function isPublicSettingKey(key: string): boolean {
  return PUBLIC_SETTING_SET.has(key);
}

export interface SettingRowLike {
  key: string;
  value: string | null;
}

/** Filtra las filas de `settings` y las devuelve como mapa clave→valor público. */
export function filterPublicSettings(
  rows: readonly SettingRowLike[],
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const row of rows) {
    if (isPublicSettingKey(row.key)) map[row.key] = row.value ?? "";
  }
  return map;
}

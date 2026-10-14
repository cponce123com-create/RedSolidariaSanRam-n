/**
 * Aliados y patrocinadores: contrato compartido (Prompt Maestro V7.1 · Fase 6).
 *
 * Antes, el tipo y las etiquetas de aliado vivían solo en la página `/aliados`,
 * así que la sección «Aliados y patrocinadores» de la página de ChocoFest no
 * podía consumir el mismo módulo y quedaba como marcador de posición. Este
 * módulo centraliza el contrato para que TODAS las superficies públicas (la
 * página de aliados y la del evento) muestren los MISMOS datos reales.
 */

export interface Ally {
  id: number;
  name: string;
  type: string;
  logo: string | null;
  description: string | null;
  website: string | null;
  featured: boolean;
  active: boolean;
}

/**
 * Claves i18n del tipo de aliado (se traducen con t() al renderizar). Los
 * valores son claves, no textos: mantiene los dos idiomas sincronizados.
 */
export const ALLY_TYPE_LABELS: Record<string, string> = {
  empresa: "allies.typeEmpresa",
  emprendimiento: "allies.typeEmprendimiento",
  institucion: "allies.typeInstitucion",
  persona: "allies.typePersona",
  ong: "allies.typeOng",
};

export const ALLY_TYPE_COLORS: Record<string, string> = {
  empresa: "bg-blue-100 text-blue-700",
  emprendimiento: "bg-green-100 text-green-700",
  institucion: "bg-purple-100 text-purple-700",
  persona: "bg-rose-100 text-rose-700",
  ong: "bg-amber-100 text-amber-700",
};

/** Carga los aliados públicos (solo activos, según el API). */
export async function fetchAllies(): Promise<Ally[]> {
  const res = await fetch("/api/allies");
  if (!res.ok) throw new Error("No se pudieron cargar los aliados");
  return res.json();
}

/** Orden de presentación: destacados primero, conservando el orden del API. */
export function sortAllies(allies: readonly Ally[]): Ally[] {
  return [...allies.filter((a) => a.featured), ...allies.filter((a) => !a.featured)];
}

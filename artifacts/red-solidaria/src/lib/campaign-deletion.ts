/**
 * Presentación del diagnóstico de borrado de campañas (V7.1 · Fase 1.4).
 *
 * Funciones PURAS y testeables (sin red, sin React): traducen el diagnóstico
 * que devuelve `GET /api/campaigns/:id/deletion-diagnostic` a la información que
 * el panel muestra ANTES de confirmar cualquier eliminación: qué dependencias
 * existen, qué se borraría, qué se conservaría y por qué una operación no está
 * disponible.
 *
 * La autoridad sigue siendo el servidor: aquí solo se decide QUÉ mostrar.
 */

export type DependencyDisposition = "protected" | "delete" | "unlink";

export interface DeletionDependency {
  key: string;
  label: string;
  count: number;
  disposition: DependencyDisposition;
}

export interface DeletionOperation {
  operation: string;
  label: string;
  available: boolean;
  reason?: string;
}

export interface DeletionDiagnostic {
  status: string;
  statusLabel: string;
  canDelete: boolean;
  canArchive: boolean;
  blockedReason: string | null;
  total: number;
  protectedCount: number;
  auxiliaryCount: number;
  dependencies: DeletionDependency[];
  operations: DeletionOperation[];
}

export interface CampaignDeletionDiagnostic {
  id: number;
  title: string;
  status: string;
  dependencies: Record<string, number>;
  diagnostic: DeletionDiagnostic;
}

export interface GroupedDependencies {
  /** Bloquean el borrado: se conservan (obligan a archivar). */
  protected: DeletionDependency[];
  /** Se eliminan con el borrador. */
  removed: DeletionDependency[];
  /** Se conservan pero se sueltan de la campaña. */
  unlinked: DeletionDependency[];
}

/** Agrupa las dependencias por disposición, preservando el orden del servidor. */
export function groupDependencies(
  dependencies: readonly DeletionDependency[],
): GroupedDependencies {
  const grouped: GroupedDependencies = { protected: [], removed: [], unlinked: [] };
  for (const entry of dependencies) {
    if (entry.count <= 0) continue;
    if (entry.disposition === "protected") grouped.protected.push(entry);
    else if (entry.disposition === "delete") grouped.removed.push(entry);
    else grouped.unlinked.push(entry);
  }
  return grouped;
}

/** Suma los recuentos de una lista de dependencias. */
export function totalOf(dependencies: readonly DeletionDependency[]): number {
  return dependencies.reduce((sum, entry) => sum + Math.max(0, entry.count), 0);
}

/** Frase legible con las dependencias y sus cantidades. */
export function describeDependencies(
  dependencies: readonly DeletionDependency[],
): string {
  const parts = dependencies
    .filter((entry) => entry.count > 0)
    .map((entry) => `${entry.count} ${entry.label}`);
  return parts.join(", ");
}

/** Busca una operación del diagnóstico por su nombre. */
export function findOperation(
  diagnostic: DeletionDiagnostic,
  operation: string,
): DeletionOperation | undefined {
  return diagnostic.operations.find((item) => item.operation === operation);
}

/**
 * La purga de datos de prueba (Modalidad C) exige, además de estar disponible
 * en el diagnóstico, el rol `superadmin`: es una operación reforzada y el
 * servidor la rechaza con 403 para cualquier otro rol. La interfaz no debe
 * ofrecer un botón que el servidor va a rechazar.
 */
export function canPurgeTestData(
  diagnostic: DeletionDiagnostic,
  role: string | null | undefined,
): boolean {
  const operation = findOperation(diagnostic, "testPurge");
  return Boolean(operation?.available) && role === "superadmin";
}

/** Título corto para la cabecera del diálogo, según lo que se puede hacer. */
export function deletionHeadline(diagnostic: DeletionDiagnostic): string {
  if (diagnostic.canDelete) return "Listo para eliminar";
  if (diagnostic.canArchive) return "No se puede eliminar: archívala";
  return "Operación no disponible";
}

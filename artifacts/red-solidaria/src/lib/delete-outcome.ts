/**
 * Interpretación del resultado de un DELETE del panel (Fase 2 — eliminaciones
 * seguras del Prompt Maestro).
 *
 * El problema real que resuelve: el panel mostraba «eliminado» aunque la API
 * hubiera respondido 404 (no se borró ninguna fila), 409 (hay dependencias que
 * bloquean el borrado) o 500. `fetch` resuelve igual en todos esos casos, así
 * que sin traducir el código HTTP el usuario veía un éxito falso y el contenido
 * seguía publicado.
 *
 * `interpretDeleteStatus` convierte el código en una decisión explícita y
 * `describeDeleteOutcome` produce el mensaje que ve el administrador, indicando
 * además si debe ofrecerse la alternativa NO destructiva (despublicar) en lugar
 * de insistir en el borrado.
 *
 * Módulo PURO y SIN DEPENDENCIAS (se compila con esbuild para `node:test`).
 */

export type DeleteOutcomeKind =
  | "deleted"
  | "not_found"
  | "conflict"
  | "forbidden"
  | "unauthorized"
  | "server_error"
  | "unknown";

export interface DeleteOutcome {
  kind: DeleteOutcomeKind;
  /** La operación se completó y el recurso ya no existe. */
  succeeded: boolean;
  /**
   * Existe una alternativa segura (despublicar/archivar) que NO destruye
   * dependencias. Solo en conflictos: la API rechaza el borrado porque hay
   * registros vinculados que deben conservarse.
   */
  canUnpublish: boolean;
}

/**
 * Traduce el código HTTP de un DELETE a un desenlace tipado.
 * 200/204 → borrado; 404 → nada que borrar; 409 → bloqueado por dependencias.
 */
export function interpretDeleteStatus(status: number): DeleteOutcome {
  if (status === 200 || status === 204) {
    return { kind: "deleted", succeeded: true, canUnpublish: false };
  }
  switch (status) {
    case 404:
      return { kind: "not_found", succeeded: false, canUnpublish: false };
    case 409:
      return { kind: "conflict", succeeded: false, canUnpublish: true };
    case 401:
      return { kind: "unauthorized", succeeded: false, canUnpublish: false };
    case 403:
      return { kind: "forbidden", succeeded: false, canUnpublish: false };
    default:
      return status >= 500
        ? { kind: "server_error", succeeded: false, canUnpublish: false }
        : { kind: "unknown", succeeded: false, canUnpublish: false };
  }
}

function capitalize(text: string): string {
  return text.length === 0 ? text : text.charAt(0).toUpperCase() + text.slice(1);
}

/** Título del aviso según el desenlace. `entityLabel` es un sintagma, p. ej. «la mascota». */
export function deleteOutcomeTitle(kind: DeleteOutcomeKind, entityLabel: string): string {
  switch (kind) {
    case "deleted":
      return `${capitalize(entityLabel)} se eliminó correctamente`;
    case "not_found":
      return `No se encontró ${entityLabel} para eliminar`;
    case "conflict":
      return `No se puede eliminar ${entityLabel}`;
    case "forbidden":
      return `No tienes permiso para eliminar ${entityLabel}`;
    case "unauthorized":
      return "Tu sesión expiró";
    case "server_error":
    case "unknown":
    default:
      return `No se pudo eliminar ${entityLabel}`;
  }
}

/** Detalle por defecto cuando el servidor no aporta un mensaje propio. */
export function deleteOutcomeDescription(kind: DeleteOutcomeKind): string {
  switch (kind) {
    case "deleted":
      return "";
    case "not_found":
      return "Puede que ya se hubiera eliminado; la lista se ha actualizado.";
    case "conflict":
      return "Tiene registros vinculados que deben conservarse. Puedes despublicar en su lugar.";
    case "forbidden":
      return "Tu cuenta no tiene permiso para esta acción.";
    case "unauthorized":
      return "Vuelve a iniciar sesión e inténtalo de nuevo.";
    case "server_error":
      return "Vuelve a intentarlo en unos momentos.";
    case "unknown":
    default:
      return "El servidor respondió de forma inesperada.";
  }
}

export interface DeleteOutcomeMessage {
  title: string;
  description: string;
  /** `true` si debe ofrecerse la alternativa «despublicar» al usuario. */
  canUnpublish: boolean;
}

/**
 * Mensaje final para el usuario. Si el servidor devolvió un mensaje propio
 * (p. ej. «Esta mascota tiene 3 solicitud(es)…») se usa ese texto REAL; si no,
 * se recurre a la descripción por defecto del desenlace.
 */
export function describeDeleteOutcome(
  outcome: DeleteOutcome,
  entityLabel: string,
  serverMessage?: string | null,
): DeleteOutcomeMessage {
  const detail = serverMessage?.trim();
  return {
    title: deleteOutcomeTitle(outcome.kind, entityLabel),
    description: detail && detail.length > 0 ? detail : deleteOutcomeDescription(outcome.kind),
    canUnpublish: outcome.canUnpublish,
  };
}

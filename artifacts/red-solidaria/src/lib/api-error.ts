/**
 * Manejo compartido de errores de la API del panel administrativo.
 *
 * Los endpoints de administración devuelven `{ error, message }` en caso de
 * fallo; aquí se convierte ese mensaje REAL en el texto que ve el administrador
 * (en vez de un "algo salió mal" genérico).
 */

export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export async function readErrorMessage(res: Response): Promise<string> {
  try {
    const body: unknown = await res.json();
    if (body && typeof body === "object") {
      const candidate = body as { message?: unknown; error?: unknown };
      if (typeof candidate.message === "string" && candidate.message.trim()) {
        return candidate.message;
      }
      if (typeof candidate.error === "string" && candidate.error.trim()) {
        return candidate.error;
      }
    }
  } catch {
    // cuerpo no-JSON: se usa el mensaje genérico
  }
  return `No se pudo completar la operación (HTTP ${res.status})`;
}

/** Mensaje legible para cualquier error de mutación. */
export function errorMessage(err: unknown, fallback = "Error inesperado"): string {
  if (err instanceof Error && err.message.trim()) return err.message;
  return fallback;
}

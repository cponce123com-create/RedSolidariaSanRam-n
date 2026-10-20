import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

/**
 * Guardas de administración de usuarios (V14-1.3) — lógica PURA + revocación.
 *
 * PROBLEMA QUE CORRIGEN
 * ---------------------
 * Ni `DELETE /admin/users/:id` ni `PATCH /admin/users/:id` comprobaban nada más allá
 * de «eres superadmin». Con eso, un superadmin podía:
 *
 *   · eliminar SU PROPIA cuenta (se quedaba fuera al instante), y
 *   · eliminar, desactivar o degradar al ÚLTIMO superadmin activo, dejando el panel
 *     sin nadie capaz de administrarlo (bloqueo total, sin recuperación desde la
 *     interfaz).
 *
 * Las reglas van en el SERVIDOR (no en botones deshabilitados) y son puras para poder
 * probarlas sin base de datos.
 */

/** Roles válidos del panel (deben coincidir con `middleware/roles.ts`). */
export const ADMIN_ROLES = ["superadmin", "administrador", "moderador"] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

export const SUPERADMIN_ROLE = "superadmin";

export interface AdminUserSnapshot {
  id: number;
  username: string;
  role: string;
  active: boolean;
}

export interface GuardContext {
  /** Quien ejecuta la operación (de la sesión). */
  actor: { id: number; username: string } | null;
  /** Usuario afectado, tal y como está AHORA en la base. */
  target: AdminUserSnapshot | null;
  /** Superadmins ACTIVOS que hay en este momento (contado dentro de la transacción). */
  activeSuperadmins: number;
}

export type GuardResult =
  | { ok: true }
  | { ok: false; code: string; message: string; status: number };

const NOT_FOUND: GuardResult = {
  ok: false,
  code: "not_found",
  message: "Usuario no encontrado.",
  status: 404,
};

const LAST_SUPERADMIN: GuardResult = {
  ok: false,
  code: "last_superadmin",
  message:
    "No se puede dejar el panel sin ningún superadministrador activo: crea o activa otro antes de continuar.",
  status: 409,
};

/** ¿Es el último superadmin ACTIVO? */
function isLastActiveSuperadmin(ctx: GuardContext): boolean {
  return (
    ctx.target !== null &&
    ctx.target.role === SUPERADMIN_ROLE &&
    ctx.target.active === true &&
    ctx.activeSuperadmins <= 1
  );
}

/** Guarda del borrado de un usuario administrativo. Puro. */
export function guardDeleteAdminUser(ctx: GuardContext): GuardResult {
  if (!ctx.target) return NOT_FOUND;
  // Eliminarse a sí mismo es un accidente irreversible: se exige que lo haga otro.
  if (ctx.actor && ctx.actor.id === ctx.target.id) {
    return {
      ok: false,
      code: "self_deletion",
      message:
        "No puedes eliminar tu propia cuenta. Pídeselo a otro superadministrador (evita quedarte fuera por error).",
      status: 409,
    };
  }
  if (isLastActiveSuperadmin(ctx)) return LAST_SUPERADMIN;
  return { ok: true };
}

export interface UpdateGuardContext extends GuardContext {
  /** Campos que la petición quiere cambiar. */
  changes: { role?: string; active?: boolean };
}

/** Guarda de la edición de un usuario administrativo. Puro. */
export function guardUpdateAdminUser(ctx: UpdateGuardContext): GuardResult {
  if (!ctx.target) return NOT_FOUND;

  if (ctx.changes.role !== undefined && !(ADMIN_ROLES as readonly string[]).includes(ctx.changes.role)) {
    return {
      ok: false,
      code: "invalid_role",
      message: `Rol no válido. Valores permitidos: ${ADMIN_ROLES.join(", ")}.`,
      status: 400,
    };
  }

  const demoting = ctx.changes.role !== undefined && ctx.changes.role !== SUPERADMIN_ROLE;
  const deactivating = ctx.changes.active === false && ctx.target.active === true;

  if (isLastActiveSuperadmin(ctx) && (demoting || deactivating)) {
    return LAST_SUPERADMIN;
  }
  // Desactivarse a sí mismo también deja fuera a quien lo hace: mismo criterio que el
  // borrado, para que la regla sea coherente y predecible.
  if (ctx.actor && ctx.actor.id === ctx.target.id && deactivating) {
    return {
      ok: false,
      code: "self_deactivation",
      message: "No puedes desactivar tu propia cuenta.",
      status: 409,
    };
  }
  return { ok: true };
}

/**
 * ¿Hay que revocar las sesiones abiertas de este usuario?
 *
 * Al DESACTIVARLO o cambiarle el ROL, su sesión seguiría viva con los permisos
 * antiguos: la desactivación no surtiría efecto hasta que caducara la cookie. Puro.
 */
export function shouldRevokeSessions(
  before: AdminUserSnapshot,
  changes: { role?: string; active?: boolean; password?: boolean; username?: string },
): { revoke: boolean; reason: string | null } {
  // Cambiar la contraseña invalida las sesiones abiertas (incluida la del propio
  // administrador): una cookie robada antes del cambio no debe sobrevivir.
  if (changes.password === true) {
    return { revoke: true, reason: "password_changed" };
  }
  // Cambiar el nombre de usuario también invalida la sesión: es el identificador
  // con el que se autentica y con el que se auditan sus acciones.
  if (changes.username !== undefined && changes.username !== before.username) {
    return { revoke: true, reason: "username_changed" };
  }
  if (changes.active === false && before.active === true) {
    return { revoke: true, reason: "deactivated" };
  }
  if (changes.role !== undefined && changes.role !== before.role) {
    return { revoke: true, reason: "role_changed" };
  }
  return { revoke: false, reason: null };
}

/**
 * Revoca todas las sesiones abiertas de un usuario administrativo.
 *
 * Las sesiones viven en PostgreSQL (`connect-pg-simple`, tabla `session`) con el
 * usuario en `sess->'adminUser'`. Se borran sus filas: la próxima petición con esa
 * cookie ya no encuentra sesión y el usuario vuelve al login. Se usa para que
 * desactivar o cambiar el rol de alguien surta efecto INMEDIATO.
 *
 * También borra los RETOS de 2FA pendientes (`pendingAdminTwoFactor`): un login
 * a medias con la contraseña antigua no debe poder completarse después de un
 * cambio de contraseña, nombre de usuario o factor.
 */
export async function revokeAdminSessions(userId: number): Promise<number> {
  const result = await db.execute(sql`
    DELETE FROM session
    WHERE (sess -> 'adminUser' ->> 'id') = ${String(userId)}
       OR (sess -> 'pendingAdminTwoFactor' ->> 'userId') = ${String(userId)}
  `);
  return result.rowCount ?? 0;
}

/**
 * Igual que `revokeAdminSessions`, pero conserva la sesión actual.
 *
 * Se usa en cambios de 2FA hechos por el propio usuario: las demás sesiones
 * (posiblemente robadas) se cierran, pero la que está ejecutando la operación
 * sigue válida para que el panel no expulse al usuario justo después de activar
 * su segundo factor.
 */
export async function revokeOtherAdminSessions(
  userId: number,
  currentSessionId?: string | null,
): Promise<number> {
  if (!currentSessionId) return revokeAdminSessions(userId);
  const result = await db.execute(sql`
    DELETE FROM session
    WHERE (
      (sess -> 'adminUser' ->> 'id') = ${String(userId)}
      OR (sess -> 'pendingAdminTwoFactor' ->> 'userId') = ${String(userId)}
    )
    AND sid <> ${currentSessionId}
  `);
  return result.rowCount ?? 0;
}
import { db, adminUsersTable, envSuperadminTwoFactorTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { ENV_SUPERADMIN_USERNAME } from "./superadmin-credentials";

/**
 * Cuentas con 2FA (TOTP) — V7.2.3.
 *
 * El sistema tiene DOS formas de superadministrador y solo una tenía dónde
 * guardar su secreto:
 *
 *  · una FILA de `admin_users` (`two_factor_secret`), y
 *  · el superadministrador de RESPALDO por variables de entorno
 *    (`ADMIN_USERNAME`/`ADMIN_PASSWORD`), que NO tiene fila: su sesión lleva
 *    `id: 0`. Hasta ahora `/admin/2fa/*` le respondía 404 y quedaba siempre
 *    protegido solo por contraseña. Como `app.ts` exige esas variables en
 *    producción, el panel tenía una entrada sin segundo factor: activar 2FA en un
 *    usuario de tabla no protegía del todo.
 *
 * Este módulo abstrae las dos con la misma interfaz (`TwoFactorAccount`), de modo
 * que los endpoints de 2FA no duplican lógica ni se acuerdan de cada caso, y su
 * secreto vive en `env_superadmin_2fa` (tabla propia, inalcanzable desde los
 * endpoints genéricos de configuración: ver el schema).
 *
 * Las funciones de DECISIÓN (`envTwoFactorActive`) son puras y testeables.
 */

/** Identificador del superadministrador de respaldo (no es una fila). */
export const ENV_SUPERADMIN_ID = 0;

/** Variable de entorno de rescate: desactiva el 2FA del superadmin de entorno. */
export const ENV_TWO_FACTOR_KILL_SWITCH = "ENV_SUPERADMIN_2FA_DISABLED";

export interface TwoFactorState {
  enabled: boolean;
  secret: string | null;
}

/**
 * Escape hatch documentado: si se pierde el autenticador del superadmin de
 * entorno no hay fila que otro superadmin pueda resetear, así que el operador
 * puede ignorar su 2FA con `ENV_SUPERADMIN_2FA_DISABLED=1` y reiniciar el
 * servicio. No debilita nada: quien puede cambiar variables de entorno ya
 * controla el despliegue entero. Queda registrado en el arranque.
 */
export function isEnvTwoFactorDisabledByEnv(): boolean {
  return process.env[ENV_TWO_FACTOR_KILL_SWITCH] === "1";
}

/**
 * ¿El 2FA del superadmin de entorno debe EXIGIRSE? Puro.
 *
 * Necesita las dos cosas: que esté activado y que haya secreto. Un `enabled` sin
 * secreto (estado incoherente) no puede exigir nada, y el escape hatch manda.
 */
export function envTwoFactorActive(
  state: TwoFactorState,
  disabledByEnv: boolean = isEnvTwoFactorDisabledByEnv(),
): boolean {
  if (disabledByEnv) return false;
  return state.enabled === true && typeof state.secret === "string" && state.secret.length > 0;
}

// ─── Almacenamiento del superadmin de entorno ────────────────────────────────

/** Estado guardado, sin aplicar el escape hatch. */
export async function readEnvSuperadminTwoFactor(): Promise<TwoFactorState> {
  const [row] = await db
    .select({
      secret: envSuperadminTwoFactorTable.secret,
      enabled: envSuperadminTwoFactorTable.enabled,
    })
    .from(envSuperadminTwoFactorTable)
    .where(eq(envSuperadminTwoFactorTable.id, 1));
  // Sin fila (o base recién migrada) el 2FA está simplemente desactivado.
  return { enabled: row?.enabled ?? false, secret: row?.secret ?? null };
}

/** ¿Debe exigirse en el login? Aplica el escape hatch. */
export async function envSuperadminTwoFactorRequired(): Promise<boolean> {
  return envTwoFactorActive(await readEnvSuperadminTwoFactor());
}

async function writeEnvSuperadminTwoFactor(
  values: Partial<{ secret: string | null; enabled: boolean }>,
): Promise<void> {
  await db
    .insert(envSuperadminTwoFactorTable)
    .values({ id: 1, ...values })
    .onConflictDoUpdate({
      target: envSuperadminTwoFactorTable.id,
      set: { ...values, updatedAt: new Date() },
    });
}

/** Guarda un secreto NUEVO sin activarlo (se activa al verificar un código). */
export async function saveEnvSuperadminSecret(secret: string): Promise<void> {
  await writeEnvSuperadminTwoFactor({ secret, enabled: false });
}

export async function enableEnvSuperadminTwoFactor(): Promise<void> {
  await writeEnvSuperadminTwoFactor({ enabled: true });
}

/** Borra el secreto y desactiva (desactivación normal o reset de rescate). */
export async function clearEnvSuperadminTwoFactor(): Promise<void> {
  await writeEnvSuperadminTwoFactor({ secret: null, enabled: false });
}

// ─── Abstracción común de las dos cuentas ────────────────────────────────────

export interface TwoFactorAccount {
  /** Identificador de sesión: 0 para el superadmin de entorno. */
  id: number;
  /** Nombre con el que se etiqueta el secreto en la app de autenticación. */
  username: string;
  /** ¿Es la cuenta de respaldo por variables de entorno? */
  isEnvAccount: boolean;
  state(): Promise<TwoFactorState>;
  saveSecret(secret: string): Promise<void>;
  enable(): Promise<void>;
  clear(): Promise<void>;
}

/**
 * Resuelve la cuenta 2FA a partir del usuario de sesión. Devuelve `null` si la
 * sesión apunta a una fila que ya no existe (sesión obsoleta).
 */
export async function resolveTwoFactorAccount(admin: {
  id: number;
  username: string;
}): Promise<TwoFactorAccount | null> {
  if (admin.id === ENV_SUPERADMIN_ID) {
    return {
      id: ENV_SUPERADMIN_ID,
      username: ENV_SUPERADMIN_USERNAME || admin.username,
      isEnvAccount: true,
      state: readEnvSuperadminTwoFactor,
      saveSecret: saveEnvSuperadminSecret,
      enable: enableEnvSuperadminTwoFactor,
      clear: clearEnvSuperadminTwoFactor,
    };
  }

  const [row] = await db
    .select({
      id: adminUsersTable.id,
      username: adminUsersTable.username,
      twoFactorEnabled: adminUsersTable.twoFactorEnabled,
      twoFactorSecret: adminUsersTable.twoFactorSecret,
    })
    .from(adminUsersTable)
    .where(eq(adminUsersTable.id, admin.id));
  if (!row) return null;

  return {
    id: row.id,
    username: row.username,
    isEnvAccount: false,
    state: async () => ({ enabled: row.twoFactorEnabled, secret: row.twoFactorSecret }),
    saveSecret: async (secret) => {
      await db
        .update(adminUsersTable)
        .set({ twoFactorSecret: secret })
        .where(eq(adminUsersTable.id, row.id));
    },
    enable: async () => {
      await db
        .update(adminUsersTable)
        .set({ twoFactorEnabled: true })
        .where(eq(adminUsersTable.id, row.id));
    },
    clear: async () => {
      await db
        .update(adminUsersTable)
        .set({ twoFactorSecret: null, twoFactorEnabled: false })
        .where(eq(adminUsersTable.id, row.id));
    },
  };
}

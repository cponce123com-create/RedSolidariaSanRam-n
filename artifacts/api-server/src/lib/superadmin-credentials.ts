import { hashPassword, verifyPassword } from "../middleware/auth-utils";
import { logger } from "./logger";
import { generateRandomPassword } from "./random-password";

/**
 * Credenciales del superadministrador de respaldo (variables de entorno).
 *
 * Vive aquí —y no dentro de `routes/admin.ts`— para que la REAUTENTICACIÓN
 * (`lib/admin-reauth.ts`) pueda verificar la contraseña del superadmin de
 * entorno sin duplicar la lógica de credenciales ni exponer el hash.
 *
 * El superadmin de respaldo NO tiene credenciales por defecto: en desarrollo
 * local, si faltan ADMIN_USERNAME/ADMIN_PASSWORD se generan aleatoriamente al
 * arrancar y se imprimen en consola. En cualquier otro entorno `app.ts` exige
 * ambas variables, así el fallback nunca queda activo en staging/producción.
 */
const isDev = process.env.NODE_ENV === "development";

export const ENV_SUPERADMIN_USERNAME =
  process.env.ADMIN_USERNAME || (isDev ? "admin" : "");

const envSuperadminPassword =
  process.env.ADMIN_PASSWORD || (isDev ? generateRandomPassword() : "");

if (isDev && !process.env.ADMIN_PASSWORD) {
  logger.warn(
    { username: ENV_SUPERADMIN_USERNAME },
    `Superadmin de desarrollo: ${ENV_SUPERADMIN_USERNAME} / ${envSuperadminPassword} — contraseña generada aleatoriamente. Define ADMIN_PASSWORD para fijarla.`,
  );
}

// El hash se calcula la PRIMERA vez que hace falta (no al importar el módulo):
// el login no debe pagar el coste de bcrypt en el arranque si nunca se usa.
let envSuperadminHashedPassword: string | null = null;

/** ¿El username corresponde al superadmin de respaldo por variables de entorno? */
export function isEnvSuperadminUsername(username: unknown): boolean {
  return (
    typeof username === "string" &&
    ENV_SUPERADMIN_USERNAME.length > 0 &&
    username === ENV_SUPERADMIN_USERNAME
  );
}

/** ¿Hay credenciales de superadmin de respaldo configuradas? */
export function hasEnvSuperadminCredentials(): boolean {
  return ENV_SUPERADMIN_USERNAME.length > 0 && envSuperadminPassword.length > 0;
}

/**
 * Verifica la contraseña del superadmin de respaldo. Compara siempre contra el
 * hash bcrypt (nunca contra el texto plano) y devuelve `false` si no hay
 * credenciales configuradas, para que un entorno mal configurado no autentique.
 */
export async function verifyEnvSuperadminPassword(password: string): Promise<boolean> {
  if (!hasEnvSuperadminCredentials()) return false;
  if (!envSuperadminHashedPassword) {
    envSuperadminHashedPassword = await hashPassword(envSuperadminPassword);
  }
  return verifyPassword(password, envSuperadminHashedPassword);
}

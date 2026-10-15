import { db, adminUsersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { verifyPassword } from "../middleware/auth-utils";
import { verifyTOTP } from "./totp";
import {
  isEnvSuperadminUsername,
  verifyEnvSuperadminPassword,
} from "./superadmin-credentials";
import {
  envTwoFactorActive,
  readEnvSuperadminTwoFactor,
} from "./two-factor-account";

/**
 * Reautenticación del superadministrador (V7.2).
 *
 * Las operaciones irreversibles (purga DEMO, declaración de DEMO) no se
 * autorizan solo con la sesión: si alguien deja una sesión abierta —o roba la
 * cookie— no debe poder destruir datos. Se exige volver a demostrar la identidad
 * en el momento de la acción:
 *
 *  1. la CONTRASEÑA actual del superadmin (bcrypt), y
 *  2. si la cuenta tiene 2FA activo, el código TOTP vigente.
 *
 * Cubre las dos formas de superadmin del sistema: la fila de `admin_users` y el
 * superadmin de respaldo por variables de entorno (id 0, sin fila en la tabla).
 *
 * Los errores de base de datos se propagan (la ruta responde 500): devolver
 * `ok: false` ante una caída del servidor haría creer al administrador que su
 * contraseña es incorrecta.
 */
export interface ReauthInput {
  userId: number | null;
  username: string | null;
  password: string;
  totpCode?: string | null;
}

export type ReauthResult =
  | { ok: true }
  | { ok: false; code: string; message: string };

export async function verifySuperadminReauth(input: ReauthInput): Promise<ReauthResult> {
  const password = typeof input.password === "string" ? input.password : "";
  if (password.length === 0) {
    return {
      ok: false,
      code: "reauth_required",
      message: "Reautentícate con tu contraseña de superadministrador para continuar.",
    };
  }

  // Superadmin de respaldo (id 0): no existe fila en `admin_users`.
  if (!input.userId || input.userId <= 0) {
    if (!isEnvSuperadminUsername(input.username)) {
      return {
        ok: false,
        code: "reauth_failed",
        message: "No se pudo verificar tu identidad. Vuelve a iniciar sesión.",
      };
    }
    const valid = await verifyEnvSuperadminPassword(password);
    if (!valid) {
      return { ok: false, code: "reauth_failed", message: "Contraseña incorrecta." };
    }

    // 2FA del superadmin de respaldo (migración 028). Antes esta cuenta solo
    // demostraba la contraseña, así que las operaciones irreversibles quedaban
    // con un único factor aunque tuviera 2FA activado.
    const twoFactor = await readEnvSuperadminTwoFactor();
    if (envTwoFactorActive(twoFactor) && twoFactor.secret) {
      const code = typeof input.totpCode === "string" ? input.totpCode.trim() : "";
      if (!verifyTOTP(twoFactor.secret, code)) {
        return {
          ok: false,
          code: "totp_required",
          message:
            "Introduce el código de 6 dígitos de tu aplicación de autenticación para confirmar la operación.",
        };
      }
    }

    return { ok: true };
  }

  const [row] = await db
    .select()
    .from(adminUsersTable)
    .where(eq(adminUsersTable.id, input.userId));
  if (!row || !row.active) {
    return {
      ok: false,
      code: "reauth_failed",
      message: "La cuenta ya no está activa. Vuelve a iniciar sesión.",
    };
  }

  const valid = await verifyPassword(password, row.password);
  if (!valid) {
    return { ok: false, code: "reauth_failed", message: "Contraseña incorrecta." };
  }

  if (row.twoFactorEnabled && row.twoFactorSecret) {
    const code = typeof input.totpCode === "string" ? input.totpCode.trim() : "";
    if (!verifyTOTP(row.twoFactorSecret, code)) {
      return {
        ok: false,
        code: "totp_required",
        message:
          "Introduce el código de 6 dígitos de tu aplicación de autenticación para confirmar la operación.",
      };
    }
  }

  return { ok: true };
}

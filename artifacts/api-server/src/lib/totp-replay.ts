import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

/**
 * Anti-replay del TOTP en el LOGIN.
 *
 * `totp_login_usage` guarda el último paso (contador de 30 s) consumido por
 * cuenta. La operación es atómica: dos peticiones concurrentes con el mismo
 * código compiten por el mismo `UPDATE ... WHERE last_step < nuevo`; solo una
 * gana. Un código ya usado no vuelve a abrir sesión, ni siquiera desde otra IP.
 */
export function totpAccountKey(userId: number, isEnvAccount: boolean): string {
  return isEnvAccount || userId === 0 ? "env:0" : `user:${userId}`;
}

/**
 * Registra un paso TOTP como consumido. Devuelve `false` si ese paso (o uno
 * anterior) ya se había usado; en ese caso el código debe rechazarse.
 */
export async function consumeTOTPLoginStep(accountKey: string, step: number): Promise<boolean> {
  if (!Number.isInteger(step) || step < 0) return false;
  const result = await db.execute(sql`
    INSERT INTO totp_login_usage (account_key, last_step, updated_at)
    VALUES (${accountKey}, ${step}, now())
    ON CONFLICT (account_key) DO UPDATE
      SET last_step = EXCLUDED.last_step,
          updated_at = now()
      WHERE totp_login_usage.last_step < EXCLUDED.last_step
    RETURNING account_key
  `);
  return (result.rowCount ?? 0) > 0;
}

/**
 * Borra el historial anti-replay de una cuenta cuando su secreto TOTP cambia
 * (setup/disable/reset). Sin esto, el primer código del secreto nuevo podría
 * chocar con un paso ya consumido del secreto anterior.
 */
export async function resetTOTPLoginUsage(accountKey: string): Promise<void> {
  await db.execute(sql`DELETE FROM totp_login_usage WHERE account_key = ${accountKey}`);
}


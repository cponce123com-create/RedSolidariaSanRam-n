/**
 * Bloqueo por intentos fallidos de 2FA (anti fuerza bruta sobre códigos TOTP).
 *
 * Estrategia: contador en memoria, igual que el MemoryStore de
 * express-rate-limit. Tras MAX_2FA_ATTEMPTS códigos inválidos, la CLAVE
 * (origen + cuenta) queda bloqueada durante TWO_FA_LOCKOUT_MS. El check se hace
 * ANTES de tocar la DB y el contador solo se incrementa cuando la DB confirma un
 * usuario real con código inválido → un atacante no puede ensuciar el store con
 * userIds inexistentes.
 *
 * Por qué la clave incluye el ORIGEN (corrección SEC-03): antes se indexaba solo
 * por `userId`, que viaja en el cuerpo de `/admin/2fa/login`. Cualquiera podía
 * enviar 5 códigos inválidos para el superadmin (userId 1) desde cualquier parte
 * y dejar esa cuenta SIN PODER ENTRAR durante 15 minutos, repitiéndolo
 * indefinidamente: una denegación de servicio sobre la cuenta. Con la clave
 * compuesta el bloqueo solo afecta al par origen+cuenta, así que frena la fuerza
 * bruta sin dejar fuera al administrador legítimo; la rotación de IP la cubre el
 * rate limit por IP del login (`loginLimiter`).
 *
 * Limitación: estado por proceso (el deploy en Render es de una sola instancia).
 * Un despliegue multi-instancia requeriría mover el contador a PostgreSQL o
 * Redis.
 */

export const MAX_2FA_ATTEMPTS = 5;
export const TWO_FA_LOCKOUT_MS = 15 * 60 * 1000;

interface LockoutEntry {
  attempts: number;
  lockedUntil: number | null; // epoch ms
}

const lockoutByKey = new Map<string, LockoutEntry>();

/**
 * Clave del contador: origen (IP) + cuenta. Usar SIEMPRE esta función para
 * construir la clave; el resto del módulo la trata como opaca.
 */
export function lockoutKey(
  ip: string | null | undefined,
  userId: number | string,
): string {
  const origin = typeof ip === "string" && ip.trim() ? ip.trim() : "unknown";
  return `${origin}:${userId}`;
}

/** Milisegundos restantes de bloqueo (0 si no está bloqueado). Poda entradas vencidas. */
export function getLockoutRemainingMs(key: string): number {
  const entry = lockoutByKey.get(key);
  if (!entry || !entry.lockedUntil) return 0;
  const remaining = entry.lockedUntil - Date.now();
  if (remaining <= 0) {
    lockoutByKey.delete(key);
    return 0;
  }
  return remaining;
}

/**
 * Registra un código 2FA inválido para esa clave. Devuelve si quedó bloqueada
 * con este intento y los ms restantes de bloqueo (0 si aún no está bloqueada).
 */
export function registerFailedAttempt(key: string): { locked: boolean; remainingMs: number } {
  const now = Date.now();
  const entry = lockoutByKey.get(key) ?? { attempts: 0, lockedUntil: null };

  // Ya bloqueado: no reinicia la ventana, devuelve lo que queda.
  if (entry.lockedUntil && entry.lockedUntil > now) {
    return { locked: true, remainingMs: entry.lockedUntil - now };
  }

  entry.attempts += 1;
  if (entry.attempts >= MAX_2FA_ATTEMPTS) {
    entry.lockedUntil = now + TWO_FA_LOCKOUT_MS;
    entry.attempts = 0; // el contador se reinicia junto con la ventana de bloqueo
    lockoutByKey.set(key, entry);

    // Poda defensiva: si el store crece demasiado, limpia entradas vencidas.
    if (lockoutByKey.size > 10_000) {
      for (const [k, e] of lockoutByKey) {
        if (e.lockedUntil && e.lockedUntil <= now) lockoutByKey.delete(k);
      }
    }
    return { locked: true, remainingMs: TWO_FA_LOCKOUT_MS };
  }

  lockoutByKey.set(key, entry);
  return { locked: false, remainingMs: 0 };
}

/** Limpia el contador de una clave tras una verificación correcta. */
export function clearFailedAttempts(key: string): void {
  lockoutByKey.delete(key);
}

/**
 * Limpia TODAS las entradas de una cuenta, sea cual sea el origen. Lo usa el
 * escape hatch de superadmin: al desbloquear una cuenta hay que quitarla de
 * todos los orígenes desde los que se haya fallado, porque la clave es
 * compuesta. Devuelve cuántas entradas se eliminaron.
 */
export function clearFailedAttemptsForUser(userId: number | string): number {
  const suffix = `:${userId}`;
  let removed = 0;
  for (const key of [...lockoutByKey.keys()]) {
    if (key.endsWith(suffix)) {
      lockoutByKey.delete(key);
      removed += 1;
    }
  }
  return removed;
}

/** Solo para tests: vacía el store. */
export function resetLockoutStore(): void {
  lockoutByKey.clear();
}

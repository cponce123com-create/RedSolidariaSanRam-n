// Bloqueo por intentos fallidos de 2FA (anti fuerza bruta sobre códigos TOTP).
//
// Estrategia: contador en memoria por userId, igual que el MemoryStore de
// express-rate-limit. Tras MAX_2FA_ATTEMPTS códigos inválidos la cuenta queda
// bloqueada durante TWO_FA_LOCKOUT_MS. El check se hace ANTES de tocar la DB
// (el body de /admin/2fa/login trae userId), y el contador solo se incrementa
// cuando la DB confirma un usuario real con código inválido → un atacante no
// puede ensuciar el store con userIds inexistentes.
//
// Limitación: estado por proceso (el deploy en Render es de una sola
// instancia). Un despliegue multi-instancia requeriría mover el contador a
// PostgreSQL o Redis.

export const MAX_2FA_ATTEMPTS = 5;
export const TWO_FA_LOCKOUT_MS = 15 * 60 * 1000;

interface LockoutEntry {
  attempts: number;
  lockedUntil: number | null; // epoch ms
}

const lockoutByUserId = new Map<string, LockoutEntry>();

function keyOf(userId: number | string): string {
  return String(userId);
}

/** Milisegundos restantes de bloqueo (0 si no está bloqueado). Poda entradas vencidas. */
export function getLockoutRemainingMs(userId: number | string): number {
  const entry = lockoutByUserId.get(keyOf(userId));
  if (!entry || !entry.lockedUntil) return 0;
  const remaining = entry.lockedUntil - Date.now();
  if (remaining <= 0) {
    lockoutByUserId.delete(keyOf(userId));
    return 0;
  }
  return remaining;
}

/**
 * Registra un código 2FA inválido. Devuelve si la cuenta quedó bloqueada con
 * este intento y los ms restantes de bloqueo (0 si aún no está bloqueada).
 */
export function registerFailedAttempt(userId: number | string): { locked: boolean; remainingMs: number } {
  const key = keyOf(userId);
  const now = Date.now();
  const entry = lockoutByUserId.get(key) ?? { attempts: 0, lockedUntil: null };

  // Ya bloqueado: no reinicia la ventana, devuelve lo que queda.
  if (entry.lockedUntil && entry.lockedUntil > now) {
    return { locked: true, remainingMs: entry.lockedUntil - now };
  }

  entry.attempts += 1;
  if (entry.attempts >= MAX_2FA_ATTEMPTS) {
    entry.lockedUntil = now + TWO_FA_LOCKOUT_MS;
    entry.attempts = 0; // el contador se reinicia junto con la ventana de bloqueo
    lockoutByUserId.set(key, entry);

    // Poda defensiva: si el store crece demasiado, limpia entradas vencidas.
    if (lockoutByUserId.size > 10_000) {
      for (const [k, e] of lockoutByUserId) {
        if (e.lockedUntil && e.lockedUntil <= now) lockoutByUserId.delete(k);
      }
    }
    return { locked: true, remainingMs: TWO_FA_LOCKOUT_MS };
  }

  lockoutByUserId.set(key, entry);
  return { locked: false, remainingMs: 0 };
}

/** Limpia el contador tras una verificación exitosa o un reset de 2FA. */
export function clearFailedAttempts(userId: number | string): void {
  lockoutByUserId.delete(keyOf(userId));
}

/** Solo para tests: vacía el store. */
export function resetLockoutStore(): void {
  lockoutByUserId.clear();
}

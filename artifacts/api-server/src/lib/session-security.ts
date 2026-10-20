import type { SessionAdminUser } from "../middleware/auth-utils";

/** Tiempo máximo entre la contraseña correcta y el código TOTP. */
export const ADMIN_2FA_CHALLENGE_TTL_MS = 5 * 60 * 1000;

function regenerateSession(req: any): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    req.session.regenerate((error: Error | null) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

function saveSession(req: any): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    req.session.save((error: Error | null) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

/** Establece una sesión administrativa nueva tras autenticar correctamente. */
export async function establishAdminSession(req: any, user: SessionAdminUser): Promise<void> {
  await regenerateSession(req);
  req.session.adminUser = user;
  req.session.pendingAdminTwoFactor = null;
  await saveSession(req);
}

/**
 * Abre el reto de 2FA del paso 1. Regenera la sesión para que una sesión previa
 * (o una cookie fijada por un atacante) no se reutilice, y guarda en el store
 * del servidor el usuario que deberá demostrar el segundo factor.
 */
export async function startAdminTwoFactorChallenge(
  req: any,
  user: SessionAdminUser,
  meta: { ip: string | null; userAgent: string | null },
): Promise<void> {
  await regenerateSession(req);
  req.session.pendingAdminTwoFactor = {
    userId: user.id,
    issuedAt: Date.now(),
    ip: meta.ip,
    userAgent: meta.userAgent,
    attempts: 0,
  };
  await saveSession(req);
}

/** Persiste cambios del reto (por ejemplo, un intento fallido). */
export async function saveAdminTwoFactorChallenge(req: any): Promise<void> {
  await saveSession(req);
}

/** Descarta el reto pendiente. */
export async function clearAdminTwoFactorChallenge(req: any): Promise<void> {
  if (!req.session) return;
  req.session.pendingAdminTwoFactor = null;
  await saveSession(req);
}

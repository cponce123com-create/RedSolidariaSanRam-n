import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import type { Request, Response, NextFunction } from "express";

// Rate limiter general para la API - más estricto con configuración mejorada
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100, // 100 requests por IP en 15 minutos
  message: { error: "Demasiadas solicitudes. Por favor intenta de nuevo más tarde." },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  keyGenerator: (req) => {
    // Combinar API key con IP normalizada para que rotar el header
    // no permita bypassear el límite por IP
    const apiKey = req.headers['x-api-key'] as string | undefined;
    const ip = ipKeyGenerator(req.ip ?? "unknown");
    return apiKey ? `api-key:${apiKey}:${ip}` : ip;
  },
});

// Rate limiter específico para login - muy estricto para prevenir brute force
export const loginLimiter = rateLimit({
  windowMs: 30 * 60 * 1000, // 30 minutos
  max: 10, // 10 intentos de login
  message: { error: "Demasiados intentos de inicio de sesión. Por favor espera 30 minutos." },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  keyGenerator: (req) => {
    // Limitar por IP normalizada y username combinados para login
    const username = req.body?.username || 'unknown';
    return `${ipKeyGenerator(req.ip ?? "unknown")}-${username}`;
  },
});

// Presupuesto de acciones administrativas según el rol de la sesión.
// Superadmin: holgado (gestión de usuarios y config). Admin/moderador:
// presupuesto medio. Sin sesión: mínimo (protege el gate /admin de fuerza
// bruta, p.ej. al enumerar endpoints sin credenciales).
export function adminActionLimitForRole(role?: string): number {
  // Ampliación EXPLÍCITA por variable de entorno, pensada para los ensayos de
  // extremo a extremo (un recorrido completo de la plataforma supera con holgura
  // las 100 acciones legítimas de un superadmin) y para limpiezas masivas
  // scriptadas. En producción NO se define, así que el límite real no cambia.
  const override = Number(process.env.ADMIN_ACTION_LIMIT_OVERRIDE ?? "");
  if (Number.isInteger(override) && override > 0) return override;

  if (role === "superadmin") return 100;
  if (role) return 30; // administrador / moderador
  return 20; // sin sesión
}

// Rate limiter para acciones administrativas críticas.
// keyGenerator por usuario admin (no por IP): cada admin tiene su propio
// presupuesto y un moderador no puede agotar el del superadmin compartiendo
// IP. Sin sesión cae a la IP normalizada (ipKeyGenerator evita el
// ValidationError de IPv6 de express-rate-limit v8).
export const adminActionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  limit: (req) => adminActionLimitForRole((req as any).session?.adminUser?.role),
  keyGenerator: (req) => {
    const admin = (req as any).session?.adminUser;
    const ip = ipKeyGenerator(req.ip ?? "unknown");
    return admin ? `admin:${admin.id}` : `ip:${ip}`;
  },
  message: { error: "Demasiadas acciones administrativas. Por favor espera." },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
});

// Reautenticación de operaciones IRREVERSIBLES (purga de campañas DEMO).
// Presupuesto estrecho por usuario admin: una sesión robada no puede usar el
// endpoint como oráculo para adivinar la contraseña del superadmin. Es
// independiente del presupuesto general de acciones administrativas.
//
// IMPORTANTE (corrección V7.2): solo consumen presupuesto los FALLOS DE
// IDENTIDAD (401). Antes contaba TODA petición, así que el propio flujo legítimo
// —declarar la campaña DEMO y después purgarla, más cualquier despiste al
// escribir la contraseña— agotaba los 5 intentos y dejaba el endpoint en 429
// durante 15 minutos: el superadmin veía el diálogo pero no podía completarlo.
// Un bloqueo de purga (409) o un dato inválido (400) tampoco son intentos de
// adivinar la contraseña, así que no deben gastar el presupuesto.
export const reauthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  keyGenerator: (req) => {
    const admin = (req as any).session?.adminUser;
    const ip = ipKeyGenerator(req.ip ?? "unknown");
    return admin ? `reauth:${admin.id}` : `reauth-ip:${ip}`;
  },
  // Se descuenta el intento salvo que la respuesta sea 401 (identidad no
  // verificada): el contador mide intentos fallidos de reautenticación.
  // OJO: express-rate-limit solo evalúa `requestWasSuccessful` si además está
  // activo `skipSuccessfulRequests` (o `skipFailedRequests`); con ambos en false
  // el descuento no se ejecuta y el contador volvería a medir TODA petición.
  requestWasSuccessful: (_req, res) => res.statusCode !== 401,
  skipSuccessfulRequests: true,
  message: {
    error: "too_many_attempts",
    message:
      "Demasiados intentos fallidos de reautenticación. Espera 15 minutos e inténtalo de nuevo.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

export const contactLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: "Demasiados envíos. Por favor espera 15 minutos antes de intentar de nuevo." },
  standardHeaders: true,
  legacyHeaders: false,
});

export const volunteerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: { error: "Demasiados registros. Por favor espera 1 hora antes de intentar de nuevo." },
  standardHeaders: true,
  legacyHeaders: false,
});

export const reportLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: { error: "Demasiados reportes. Por favor espera 1 hora antes de intentar de nuevo." },
  standardHeaders: true,
  legacyHeaders: false,
});

export const donationLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  message: { error: "Demasiadas solicitudes. Por favor espera antes de intentar de nuevo." },
  standardHeaders: true,
  legacyHeaders: false,
});

export const adoptionLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { error: "Demasiadas solicitudes de adopción. Por favor espera 1 hora." },
  standardHeaders: true,
  legacyHeaders: false,
});

export const testimonialLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: { error: "Demasiados testimonios. Por favor espera 1 hora antes de intentar de nuevo." },
  standardHeaders: true,
  legacyHeaders: false,
});

export const uploadSignatureLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  message: { error: "Demasiadas subidas de archivos. Por favor espera 1 hora." },
  standardHeaders: true,
  legacyHeaders: false,
});

// Limiter global de /api para tráfico anónimo: las sesiones admin autenticadas
// se eximen porque ya tienen su propio presupuesto (adminActionLimiter, por
// usuario y no por IP). Sin esta exención un panel admin activo (dashboard +
// tablas) puede agotar el límite global por IP y quedar bloqueado, arrastrando
// también a otros usuarios detrás de la misma IP (p. ej. CGNAT móvil).
export function publicApiLimiter(req: Request, res: Response, next: NextFunction) {
  if ((req as any).session?.adminUser) return next();
  return apiLimiter(req, res, next);
}

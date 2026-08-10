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
    // Limitar por IP normalizada y email combinados para login
    const email = req.body?.email || 'unknown';
    return `${ipKeyGenerator(req.ip ?? "unknown")}-${email}`;
  },
});

// Presupuesto de acciones administrativas según el rol de la sesión.
// Superadmin: holgado (gestión de usuarios y config). Admin/moderador:
// presupuesto medio. Sin sesión: mínimo (protege el gate /admin de fuerza
// bruta, p.ej. al enumerar endpoints sin credenciales).
export function adminActionLimitForRole(role?: string): number {
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

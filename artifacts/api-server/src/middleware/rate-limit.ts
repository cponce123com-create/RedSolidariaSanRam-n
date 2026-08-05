import rateLimit, { ipKeyGenerator } from "express-rate-limit";

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

// Rate limiter para acciones administrativas críticas
export const adminActionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 50, // 50 acciones administrativas
  message: { error: "Demasiadas acciones administrativas. Por favor espera." },
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

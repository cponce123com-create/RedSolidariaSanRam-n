import rateLimit from "express-rate-limit";

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

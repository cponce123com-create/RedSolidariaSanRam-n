import pino from "pino";

const isProduction = process.env.NODE_ENV === "production";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: [
    "req.headers.authorization",
    "req.headers.cookie",
    "req.headers['x-api-key']",
    "res.headers['set-cookie']",
    // Credenciales y segundos factores que puedan aparecer en cuerpos/consultas
    // registrados por error (SEC-09). Se cubren los nombres usados por la API y
    // un comodín de un nivel para estructuras anidadas.
    "req.body.password",
    "req.body.currentPassword",
    "req.body.newPassword",
    "req.body.code",
    "req.body.totpCode",
    "req.body.secret",
    "req.query.password",
    "req.query.token",
    "req.query.secret",
    "*.password",
    "*.token",
    "*.secret",
    "*.twoFactorSecret",
  ],
  ...(isProduction
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: { colorize: true },
        },
      }),
});

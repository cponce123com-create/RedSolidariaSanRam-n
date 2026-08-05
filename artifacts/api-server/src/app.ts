import express, {
  type Express,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import cors from "cors";
import helmet from "helmet";
import pinoHttp from "pino-http";
import session from "express-session";
import pgSession from "connect-pg-simple";
import path from "path";
import { pool } from "@workspace/db";
import { apiLimiter } from "./middleware/rate-limit";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

// Render/Heroku terminan TLS en un proxy: confiar en X-Forwarded-For para
// obtener la IP real del cliente (rate limiting y audit logs correctos).
app.set("trust proxy", 1);

// Helmet.js para seguridad de headers HTTP
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          // Remover 'unsafe-eval' en producción - usar nonces o hashes
          ...(process.env.NODE_ENV === "development" ? ["'unsafe-eval'"] : []),
        ],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "https:", "blob:"],
        connectSrc: [
          "'self'",
          process.env.API_URL || "https://api.redsolidaria.com",
        ],
        frameSrc: ["'none'"],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: [],
      },
    },
    crossOriginEmbedderPolicy: false,
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
    permittedCrossDomainPolicies: { permittedPolicies: "none" },
    xssFilter: true,
  }),
);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

// CORS: en producción restringido al frontend (mismo origin o CORS_ORIGIN explícito)
app.use(
  cors({
    origin:
      process.env.CORS_ORIGIN ||
      (process.env.NODE_ENV === "production"
        ? "https://redsolidariasanramon.org"
        : true),
    credentials: true,
  }),
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiter global para toda la API
app.use("/api", apiLimiter);

// Validación de variables obligatorias en producción
if (process.env.NODE_ENV === "production") {
  const missing = [
    !process.env.SESSION_SECRET && "SESSION_SECRET",
    !process.env.ADMIN_USERNAME && "ADMIN_USERNAME",
    !process.env.ADMIN_PASSWORD && "ADMIN_PASSWORD",
  ].filter(Boolean);

  if (missing.length > 0) {
    throw new Error(
      `Required environment variables in production: ${missing.join(", ")}. ` +
        `Defínelas en Render para evitar credenciales por defecto.`,
    );
  }
}

// Store de sesiones en PostgreSQL: escalable y persistente entre deploys
// (MemoryStore pierde sesiones en cada reinicio y no escala multi-instancia)
const PostgresSessionStore = pgSession(session);

app.use(
  session({
    store: new PostgresSessionStore({ pool, tableName: "session" }),
    secret: process.env.SESSION_SECRET || "redsolidaria-secret-key-2024",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production", // Solo HTTPS en producción
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000,
      sameSite: "lax", // Prevenir CSRF
    },
  }),
);

app.use("/api", router);

// Servir archivos estáticos del frontend en producción con caching optimizado
if (process.env.NODE_ENV === "production") {
  const staticPath =
    process.env.STATIC_FILES_PATH ||
    path.join(process.cwd(), "artifacts/red-solidaria/dist/public");
  logger.info({ staticPath }, "Serving static files from");

  // Assets estáticos con cache de 1 año (hash en nombres de archivo)
  app.use(
    express.static(staticPath, {
      maxAge: "1y",
      immutable: true,
      fallthrough: false,
    }),
  );

  // Para SPA con React Router: todas las rutas no-API deben servir index.html
  app.get("*path", (req, res) => {
    res.sendFile(path.join(staticPath, "index.html"));
  });
}

// Middleware de error central: loguea y responde JSON sin filtrar detalles
app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  req.log.error({ err }, "Unhandled error");
  res
    .status(500)
    .json({ error: "server_error", message: "Internal server error" });
});

export default app;

import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import pinoHttp from "pino-http";
import session from "express-session";
import path from "path";
import { apiLimiter } from "./middleware/rate-limit";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

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
app.use(cors({ origin: process.env.CORS_ORIGIN || true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiter global para toda la API
app.use("/api", apiLimiter);

// Session middleware con validación de SECRET en producción
const sessionSecret = process.env.SESSION_SECRET;
if (process.env.NODE_ENV === "production" && !sessionSecret) {
  throw new Error(
    "SESSION_SECRET environment variable is required in production",
  );
}

app.use(
  session({
    secret: sessionSecret || "redsolidaria-secret-key-2024",
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
  const staticPath = process.env.STATIC_FILES_PATH || path.join(process.cwd(), "artifacts/red-solidaria/dist/public");
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

export default app;

import express, {
  type Express,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import pinoHttp from "pino-http";
import session from "express-session";
import pgSession from "connect-pg-simple";
import path from "path";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import { pool } from "@workspace/db";
import { publicApiLimiter } from "./middleware/rate-limit";
import { publicApiCache } from "./middleware/cache-control";
import router from "./routes";
import sitemapRouter from "./routes/sitemap";
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

// Compresión gzip/brotli para respuestas JSON del API y estáticos sin
// pre-comprimir (los assets /assets/*.gz ya viajan gzip: compression detecta
// Content-Encoding existente y los deja intactos). Umbral 256B: responde
// también a payloads pequeños como /campaigns en redes lentas.
app.use(compression({ threshold: 256 }));

// SEO: sitemap.xml y robots.txt en la raíz del dominio (no bajo /api) y ANTES
// del SPA fallback y de los archivos estáticos de producción.
app.use(sitemapRouter);

// El rate limiter global de /api se monta DESPUÉS de la sesión (ver abajo):
// publicApiLimiter exime a los admins autenticados, que tienen presupuesto
// propio vía adminActionLimiter.

// Validación de variables obligatorias en cualquier entorno que no sea
// desarrollo local: evita que las credenciales por defecto (o secretos
// hardcodeados) queden activas en staging/producción si falta una variable.
if (process.env.NODE_ENV !== "development") {
  const missing = [
    !process.env.SESSION_SECRET && "SESSION_SECRET",
    !process.env.ADMIN_USERNAME && "ADMIN_USERNAME",
    !process.env.ADMIN_PASSWORD && "ADMIN_PASSWORD",
  ].filter(Boolean);

  if (missing.length > 0) {
    throw new Error(
      `Required environment variables in non-development environments: ${missing.join(", ")}. ` +
        `Defínelas en Render para evitar credenciales por defecto.`,
    );
  }

  // Cloudinary: config incompleta = error; config ausente = upload deshabilitado (503)
  const cloudinaryVars = [
    "CLOUDINARY_CLOUD_NAME",
    "CLOUDINARY_API_KEY",
    "CLOUDINARY_API_SECRET",
  ];
  const defined = cloudinaryVars.filter((v) => process.env[v]);
  if (defined.length > 0 && defined.length < cloudinaryVars.length) {
    throw new Error(
      `Cloudinary configuration incomplete. Missing: ${cloudinaryVars
        .filter((v) => !process.env[v])
        .join(", ")}. Define all 3 or none.`,
    );
  }
}

// Secreto de sesión: en staging/producción se exige SESSION_SECRET (validación
// de arriba). En desarrollo local, si no está definido, se genera uno aleatorio
// por arranque: sin secretos hardcodeados en el repositorio (las sesiones de
// dev se invalidan al reiniciar el servidor, comportamiento aceptable).
const sessionSecret =
  process.env.SESSION_SECRET ||
  (process.env.NODE_ENV === "development"
    ? randomBytes(32).toString("hex")
    : "");

// Store de sesiones en PostgreSQL: escalable y persistente entre deploys
// (MemoryStore pierde sesiones en cada reinicio y no escala multi-instancia)
const PostgresSessionStore = pgSession(session);

app.use(
  session({
    store: new PostgresSessionStore({
      pool,
      tableName: "session",
      // Limpieza periódica de sesiones expiradas (evita crecimiento del store)
      pruneSessionInterval: 300,
    }),
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    // rolling: renueva la cookie en cada petición → la sesión expira tras 24h
    // de INACTIVIDAD (no 24h desde el login, que expulsaría admins activos).
    rolling: true,
    cookie: {
      secure: process.env.NODE_ENV === "production", // Solo HTTPS en producción
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000,
      sameSite: "lax", // Prevenir CSRF
    },
  }),
);

// Rate limiter global para /api: tráfico anónimo (sesiones admin exentas).
// Va DESPUÉS de la sesión para poder detectar adminUser.
app.use("/api", publicApiLimiter);

// Caché pública (max-age 60s) para GETs anónimos de endpoints públicos.
app.use("/api", publicApiCache);

app.use("/api", router);

// Servir archivos estáticos del frontend en producción con caching optimizado
if (process.env.NODE_ENV === "production") {
  // STATIC_FILES_PATH puede venir relativo (config de Replit/Render): sendFile
  // requiere ruta absoluta, así que la normalizamos contra el cwd.
  const staticPath = path.resolve(
    process.env.STATIC_FILES_PATH ||
      path.join(process.cwd(), "artifacts/red-solidaria/dist/public"),
  );
  logger.info({ staticPath }, "Serving static files from");

  // Assets pre-comprimidos (.gz generados por el build de Vite): el bundle JS
  // principal (~676 kB) viaja a ~200 kB cuando el cliente acepta gzip. Sin esto
  // Express serviría los archivos crudos (no usa el paquete compression).
  const STATIC_CONTENT_TYPES: Record<string, string> = {
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
  };
  app.use("/assets", (req, res, next) => {
    // Nota: dentro de app.use("/assets", ...) req.path ya NO incluye el prefijo
    // /assets; originalUrl sí lo incluye (sin query string).
    const accept = req.headers["accept-encoding"] ?? "";
    const url = req.originalUrl.split("?")[0];
    const ext = path.extname(url);
    // Brotli primero: es ~15-20% más pequeño que gzip con la misma calidad.
    if (accept.includes("br")) {
      const brFile = path.join(staticPath, `${url}.br`);
      if (fs.existsSync(brFile)) {
        res.setHeader("Content-Encoding", "br");
        res.setHeader(
          "Content-Type",
          STATIC_CONTENT_TYPES[ext] || "application/octet-stream",
        );
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        res.setHeader("Vary", "Accept-Encoding");
        return res.sendFile(brFile);
      }
    }
    if (accept.includes("gzip")) {
      const gzFile = path.join(staticPath, `${url}.gz`);
      if (fs.existsSync(gzFile)) {
        res.setHeader("Content-Encoding", "gzip");
        res.setHeader(
          "Content-Type",
          STATIC_CONTENT_TYPES[ext] || "application/octet-stream",
        );
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        res.setHeader("Vary", "Accept-Encoding");
        return res.sendFile(gzFile);
      }
    }
    next();
  });

  // Assets estáticos con cache de 1 año (hash en nombres de archivo).
  // fallthrough por defecto (true): las rutas que no son archivos pasan al SPA fallback.
  // index.html se sirve SIEMPRE sin caché (no-cache) para que tras cada deploy
  // el navegador descargue los nuevos hashes de assets (evita página en blanco).
  app.use(
    express.static(staticPath, {
      maxAge: "1y",
      immutable: true,
      index: false,
      setHeaders(res, filePath) {
        if (filePath.endsWith("index.html")) {
          res.setHeader("Cache-Control", "no-cache");
        }
      },
    }),
  );

  // Para SPA con React Router: todas las rutas no-API deben servir index.html.
  // Los /assets/ inexistentes no deben caer aquí (devuelven 404 real).
  app.get("*path", (req, res, next) => {
    if (req.path.startsWith("/assets/")) {
      return next();
    }
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

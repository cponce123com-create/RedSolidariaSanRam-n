import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import session from "express-session";
import { apiLimiter } from "./middleware/rate-limit";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

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
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiter global para toda la API
app.use("/api", apiLimiter);

app.use(
  session({
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

export default app;

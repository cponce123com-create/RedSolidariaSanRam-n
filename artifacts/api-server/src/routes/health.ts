import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { HealthCheckResponse } from "@workspace/api-zod";

const router: IRouter = Router();

/** Timeout del chequeo de readiness: no colgar el health check de Render. */
const READYZ_TIMEOUT_MS = 2000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("readyz_timeout")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

// Liveness: el proceso responde (no toca la DB).
router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

// Readiness (hallazgo INF-02): verifica que la DB responde (SELECT 1) con timeout.
router.get("/readyz", async (_req, res) => {
  try {
    await withTimeout(db.execute(sql`select 1`), READYZ_TIMEOUT_MS);
    res.json({ status: "ready", db: "ok" });
  } catch {
    res.status(503).json({ status: "unavailable", db: "error" });
  }
});

export default router;

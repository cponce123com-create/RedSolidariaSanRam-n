import { Router, type IRouter, type Response } from "express";
import { db, donationsTable, campaignMovementsTable } from "@workspace/db";
import { and, desc, eq, type SQL } from "drizzle-orm";
import { requireAdmin } from "../middleware/require-admin";
import { requireRole, READ_ROLES } from "../middleware/roles";
import { adminActionLimiter } from "../middleware/rate-limit";
import { csvFilename, toCsvDocument, type CsvColumn } from "../lib/csv";

// Los informes contables son PRIVADOS (incluyen datos personales del donante).
// El supervisor tiene CONSULTA (es su función), nunca escritura.
const readRoles = [requireAdmin, requireRole(...READ_ROLES)];

const router: IRouter = Router();

/** Tope de filas por informe: evita exportaciones que tumben la memoria. */
const MAX_REPORT_ROWS = 20000;

function isoOrEmpty(value: Date | string | null | undefined): string {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function amountOrZero(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function sendCsv(res: Response, filename: string, body: string): Response {
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("Cache-Control", "private, no-store");
  return res.send(body);
}

function parseCampaignId(value: unknown): number | null {
  const n = Number.parseInt(String(value ?? ""), 10);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * GET /admin/reports/donations.csv — informe de donaciones (privado).
 * Filtros: ?status= &campaignId=
 */
router.get(
  "/admin/reports/donations.csv",
  ...readRoles,
  adminActionLimiter,
  async (req, res) => {
    try {
      const conditions: SQL[] = [];
      if (typeof req.query.status === "string" && req.query.status) {
        conditions.push(eq(donationsTable.status, req.query.status));
      }
      const campaignId = parseCampaignId(req.query.campaignId);
      if (campaignId !== null) {
        conditions.push(eq(donationsTable.campaignId, campaignId));
      }

      const rows = await db
        .select()
        .from(donationsTable)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(donationsTable.createdAt))
        .limit(MAX_REPORT_ROWS);

      const columns: CsvColumn<(typeof rows)[number]>[] = [
        { header: "id", value: (r) => r.id },
        { header: "fecha", value: (r) => isoOrEmpty(r.createdAt) },
        { header: "nombre", value: (r) => r.firstName },
        { header: "apellido", value: (r) => r.lastName },
        { header: "correo", value: (r) => r.email },
        { header: "telefono", value: (r) => r.phone },
        { header: "campana_id", value: (r) => r.campaignId },
        { header: "monto", value: (r) => amountOrZero(r.amount) },
        { header: "metodo", value: (r) => r.paymentMethod },
        { header: "estado", value: (r) => r.status },
        { header: "anonimo", value: (r) => r.anonymous },
        { header: "conciliado_por", value: (r) => r.reconciledBy },
        { header: "conciliado_en", value: (r) => isoOrEmpty(r.reconciledAt) },
      ];

      return sendCsv(
        res,
        csvFilename("donaciones"),
        toCsvDocument(columns, rows),
      );
    } catch (err) {
      req.log.error({ err }, "Failed to export donations CSV");
      return res
        .status(500)
        .json({ error: "server_error", message: "No se pudo generar el informe" });
    }
  },
);

/**
 * GET /admin/reports/movements.csv — libro contable (privado).
 * Filtros: ?campaignId= &kind= (ingreso | gasto)
 */
router.get(
  "/admin/reports/movements.csv",
  ...readRoles,
  adminActionLimiter,
  async (req, res) => {
    try {
      const conditions: SQL[] = [];
      const campaignId = parseCampaignId(req.query.campaignId);
      if (campaignId !== null) {
        conditions.push(eq(campaignMovementsTable.campaignId, campaignId));
      }
      if (typeof req.query.kind === "string" && req.query.kind) {
        conditions.push(eq(campaignMovementsTable.kind, req.query.kind));
      }

      const rows = await db
        .select()
        .from(campaignMovementsTable)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(campaignMovementsTable.createdAt))
        .limit(MAX_REPORT_ROWS);

      const columns: CsvColumn<(typeof rows)[number]>[] = [
        { header: "id", value: (r) => r.id },
        { header: "fecha", value: (r) => isoOrEmpty(r.createdAt) },
        { header: "campana_id", value: (r) => r.campaignId },
        { header: "tipo", value: (r) => r.kind },
        { header: "monto", value: (r) => amountOrZero(r.amount) },
        { header: "descripcion", value: (r) => r.description },
        { header: "origen", value: (r) => r.sourceType },
        { header: "origen_id", value: (r) => r.sourceId },
        { header: "hash", value: (r) => r.hash },
      ];

      return sendCsv(
        res,
        csvFilename("movimientos"),
        toCsvDocument(columns, rows),
      );
    } catch (err) {
      req.log.error({ err }, "Failed to export movements CSV");
      return res
        .status(500)
        .json({ error: "server_error", message: "No se pudo generar el informe" });
    }
  },
);

export default router;

import { Router } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import { communityReportsTable, insertCommunityReportSchema, updateCommunityReportSchema, campaignsTable } from "@workspace/db/schema";
import { eq, desc, and } from "drizzle-orm";
import { reportLimiter } from "../middleware/rate-limit";

const router = Router();

// ─── PUBLIC: Submit a community report ───────────────────────────────────────
router.post("/reports", reportLimiter, async (req, res) => {
  const parsed = insertCommunityReportSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Datos inválidos", details: parsed.error.issues });
  }
  const [report] = await db.insert(communityReportsTable).values(parsed.data).returning();
  return res.status(201).json(report);
});

// ─── PUBLIC: List approved urgent reports (for public page) ──────────────────
router.get("/reports/urgent", async (req, res) => {
  const reports = await db
    .select()
    .from(communityReportsTable)
    .where(eq(communityReportsTable.status, "approved"))
    .orderBy(desc(communityReportsTable.createdAt));
  res.json(reports);
});

// ─── PUBLIC: Featured urgent reports for home page ───────────────────────────
router.get("/reports/featured", async (req, res) => {
  const reports = await db
    .select()
    .from(communityReportsTable)
    .where(and(eq(communityReportsTable.status, "approved"), eq(communityReportsTable.featuredOnHome, true)))
    .orderBy(desc(communityReportsTable.createdAt));
  res.json(reports);
});

// ─── ADMIN: List all reports (with optional status filter) ───────────────────
router.get("/admin/reports", async (req, res) => {
  const { status } = req.query;
  let query = db.select().from(communityReportsTable).$dynamic();
  if (status && typeof status === "string" && status !== "all") {
    query = query.where(eq(communityReportsTable.status, status));
  }
  const reports = await query.orderBy(desc(communityReportsTable.createdAt));
  return res.json(reports);
});

// ─── ADMIN: Get single report ─────────────────────────────────────────────────
router.get("/admin/reports/:id", async (req, res) => {
  const id = Number(req.params.id);
  const [report] = await db.select().from(communityReportsTable).where(eq(communityReportsTable.id, id));
  if (!report) return res.status(404).json({ error: "Reporte no encontrado" });
  return res.json(report);
});

// ─── ADMIN: Update report status / notes / featured ──────────────────────────
router.patch("/admin/reports/:id", async (req, res) => {
  const id = Number(req.params.id);
  const parsed = updateCommunityReportSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Datos inválidos", details: parsed.error.issues });
  }
  const [updated] = await db
    .update(communityReportsTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(communityReportsTable.id, id))
    .returning();
  if (!updated) return res.status(404).json({ error: "Reporte no encontrado" });
  return res.json(updated);
});

// Schema mínimo para convertir un reporte en campaña: todos los campos son
// opcionales porque caen al fallback (datos del reporte o valores por defecto),
// pero con los TIPOS correctos para no insertar valores basura en campaignsTable.
const convertReportSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  goal: z.number().positive().optional(),
  imageUrl: z.string().optional(),
  category: z.string().optional(),
});

// ─── ADMIN: Convert report to campaign ───────────────────────────────────────
router.post("/admin/reports/:id/convert", async (req, res) => {
  const id = Number(req.params.id);

  // Validación de tipos antes de tocar la DB (fail-fast, mismo patrón safeParse
  // que el resto de endpoints con schema Zod).
  const parsed = convertReportSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "validation_error", message: "Datos inválidos", details: parsed.error.issues });
  }

  const [report] = await db.select().from(communityReportsTable).where(eq(communityReportsTable.id, id));
  if (!report) return res.status(404).json({ error: "Reporte no encontrado" });

  const { title, description, goal, imageUrl, category } = parsed.data;
  const today = new Date().toISOString().split("T")[0];

  const [campaign] = await db.insert(campaignsTable).values({
    title: title || report.title,
    description: description || report.description,
    imageUrl: imageUrl || (report.photos?.[0] ?? null),
    goal: goal || 1000,
    raised: 0,
    status: "active",
    featured: false,
    category: category || "general",
    startDate: today,
  }).returning();

  const [updated] = await db
    .update(communityReportsTable)
    .set({ status: "converted", campaignId: campaign.id, updatedAt: new Date() })
    .where(eq(communityReportsTable.id, id))
    .returning();

  return res.status(201).json({ campaign, report: updated });
});

// ─── ADMIN: Delete report ─────────────────────────────────────────────────────
router.delete("/admin/reports/:id", async (req, res) => {
  const id = Number(req.params.id);
  await db.delete(communityReportsTable).where(eq(communityReportsTable.id, id));
  return res.status(204).send();
});

export default router;

import { Router } from "express";
import { db, campaignsTable } from "@workspace/db";
import { settings } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { requireRole, ROLES } from "../middleware/roles";
import { PROTAGONIST_SETTING_KEY } from "../lib/campaign-lifecycle";

const router = Router();

// GET /settings — public (returns key-value map)
router.get("/settings", async (_req, res) => {
  const rows = await db.select().from(settings).orderBy(settings.group, settings.key);
  const map: Record<string, string> = {};
  for (const r of rows) map[r.key] = r.value ?? "";
  res.json(map);
});

// GET /admin/settings — admin (full rows with metadata)
router.get("/admin/settings", requireRole(ROLES.SUPERADMIN), async (req, res) => {
  const rows = await db.select().from(settings).orderBy(settings.group, settings.key);
  return res.json(rows);
});

// PUT /admin/settings/:key — crea o actualiza una configuración (upsert).
// Antes solo actualizaba (404 si la clave no existía), lo que impedía crear
// claves nuevas desde el panel (p. ej. los datos del evento ChocoFest).
router.put("/admin/settings/:key", requireRole(ROLES.SUPERADMIN), async (req, res) => {
  const key = String(req.params.key).trim().slice(0, 100);
  if (!key) {
    return res.status(400).json({ error: "validation_error", message: "Clave inválida" });
  }
  const body: { value?: unknown; label?: unknown; group?: unknown } = req.body ?? {};
  if (typeof body.value !== "string") {
    return res.status(400).json({ error: "validation_error", message: "El valor debe ser texto" });
  }
  const label = (typeof body.label === "string" ? body.label : key).slice(0, 200);
  const group = (typeof body.group === "string" ? body.group : "general").slice(0, 50);

  const [row] = await db
    .insert(settings)
    .values({ key, value: body.value, label, group })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: body.value, updatedAt: new Date() },
    })
    .returning();

  return res.json(row);
});

// PUT /admin/settings — batch update
router.put("/admin/settings", requireRole(ROLES.SUPERADMIN), async (req, res) => {
  const updates = req.body as Record<string, string>;
  if (!updates || typeof updates !== "object") return res.status(400).json({ error: "Body inválido" });

  const results = [];
  for (const [key, value] of Object.entries(updates)) {
    const [row] = await db
      .update(settings)
      .set({ value: String(value), updatedAt: new Date() })
      .where(eq(settings.key, key))
      .returning();
    if (row) results.push(row);
  }

  return res.json({ updated: results.length, settings: results });
});

// PROTAGONIST_SETTING_KEY se define en ../lib/campaign-lifecycle (fuente única
// de verdad, compartida con routes/campaigns.ts y con el frontend).

/**
 * PUT /admin/protagonist-campaign — fija (o limpia) la campaña protagonista.
 *
 * Identificador ESTABLE: se guarda el id de la campaña, nunca su título, así
 * renombrarla no rompe el protagonismo. Al tratarse de una única clave, solo
 * puede haber una campaña protagonista a la vez. `campaignId: null` (o 0)
 * restaura la portada general.
 */
router.put("/admin/protagonist-campaign", requireRole(ROLES.SUPERADMIN), async (req, res) => {
  const body: { campaignId?: unknown } = req.body ?? {};
  const { campaignId } = body;

  const isClearing = campaignId === null || campaignId === undefined || campaignId === 0;
  let targetId: number | null = null;

  if (!isClearing) {
    if (typeof campaignId !== "number" || !Number.isInteger(campaignId) || campaignId <= 0) {
      return res.status(400).json({
        error: "invalid_body",
        message: "campaignId debe ser un entero positivo o null",
      });
    }
    targetId = campaignId;

    const [campaign] = await db
      .select({ id: campaignsTable.id })
      .from(campaignsTable)
      .where(eq(campaignsTable.id, targetId));
    if (!campaign) {
      return res.status(404).json({ error: "not_found", message: "Campaña no encontrada" });
    }
  }

  const value = targetId === null ? "" : String(targetId);
  const [row] = await db
    .insert(settings)
    .values({
      key: PROTAGONIST_SETTING_KEY,
      value,
      label: "Campaña protagonista de la portada",
      group: "home",
    })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value, updatedAt: new Date() },
    })
    .returning();

  return res.json({
    key: PROTAGONIST_SETTING_KEY,
    campaignId: targetId,
    updatedAt: row?.updatedAt ?? null,
  });
});

export default router;

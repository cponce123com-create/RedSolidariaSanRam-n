import { Router } from "express";
import { db, campaignsTable } from "@workspace/db";
import { settings } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { requireRole, ROLES } from "../middleware/roles";

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

// PUT /admin/settings/:key — update one setting
router.put("/admin/settings/:key", requireRole(ROLES.SUPERADMIN), async (req, res) => {
  const key = String(req.params.key);
  const { value } = req.body;
  if (typeof value !== "string") return res.status(400).json({ error: "Valor requerido" });

  const [updated] = await db
    .update(settings)
    .set({ value, updatedAt: new Date() })
    .where(eq(settings.key, key))
    .returning();

  if (!updated) return res.status(404).json({ error: "Configuración no encontrada" });
  return res.json(updated);
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

/**
 * Clave de `settings` que guarda el id de la campaña protagonista de la portada.
 * Debe coincidir con PROTAGONIST_SETTING_KEY del frontend (src/lib/chocofest.ts).
 */
export const PROTAGONIST_SETTING_KEY = "protagonist_campaign_id";

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

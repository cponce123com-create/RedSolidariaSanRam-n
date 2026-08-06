import { Router } from "express";
import { db } from "@workspace/db";
import { settings } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const router = Router();

// GET /settings — public (returns key-value map)
router.get("/settings", async (_req, res) => {
  const rows = await db.select().from(settings).orderBy(settings.group, settings.key);
  const map: Record<string, string> = {};
  for (const r of rows) map[r.key] = r.value ?? "";
  res.json(map);
});

// GET /admin/settings — admin (full rows with metadata)
router.get("/admin/settings", async (req, res) => {
  const rows = await db.select().from(settings).orderBy(settings.group, settings.key);
  return res.json(rows);
});

// PUT /admin/settings/:key — update one setting
router.put("/admin/settings/:key", async (req, res) => {
  const { key } = req.params;
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
router.put("/admin/settings", async (req, res) => {
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

export default router;

import { Router } from "express";
import { db } from "@workspace/db";
import { alliesTable, insertAllySchema } from "@workspace/db/schema";
import { eq, desc, asc } from "drizzle-orm";

const router = Router();

// ─── PUBLIC: List active allies ───────────────────────────────────────────────
router.get("/allies", async (req, res) => {
  const allies = await db.select().from(alliesTable)
    .where(eq(alliesTable.active, true))
    .orderBy(desc(alliesTable.featured), asc(alliesTable.sortOrder), desc(alliesTable.createdAt));
  res.json(allies);
});

// ─── ADMIN: List all allies ───────────────────────────────────────────────────
router.get("/admin/allies", async (req, res) => {
  if (!(req.session as any).adminUser) return res.status(401).json({ error: "unauthorized" });
  const allies = await db.select().from(alliesTable).orderBy(asc(alliesTable.sortOrder), desc(alliesTable.createdAt));
  return res.json(allies);
});

// ─── ADMIN: Create ally ───────────────────────────────────────────────────────
router.post("/admin/allies", async (req, res) => {
  if (!(req.session as any).adminUser) return res.status(401).json({ error: "unauthorized" });
  const parsed = insertAllySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Datos inválidos", details: parsed.error.issues });
  const [ally] = await db.insert(alliesTable).values(parsed.data).returning();
  return res.status(201).json(ally);
});

// ─── ADMIN: Update ally ───────────────────────────────────────────────────────
router.patch("/admin/allies/:id", async (req, res) => {
  if (!(req.session as any).adminUser) return res.status(401).json({ error: "unauthorized" });
  const id = Number(req.params.id);
  const [updated] = await db.update(alliesTable).set(req.body).where(eq(alliesTable.id, id)).returning();
  if (!updated) return res.status(404).json({ error: "Aliado no encontrado" });
  return res.json(updated);
});

// ─── ADMIN: Delete ally ───────────────────────────────────────────────────────
router.delete("/admin/allies/:id", async (req, res) => {
  if (!(req.session as any).adminUser) return res.status(401).json({ error: "unauthorized" });
  await db.delete(alliesTable).where(eq(alliesTable.id, Number(req.params.id)));
  return res.status(204).send();
});

export default router;

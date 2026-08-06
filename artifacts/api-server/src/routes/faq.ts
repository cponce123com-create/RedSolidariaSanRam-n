import { Router } from "express";
import { db, faqTable, insertFaqSchema } from "@workspace/db";
import { eq, asc } from "drizzle-orm";

const router = Router();

// ─── PUBLIC: Active FAQs ──────────────────────────────────────────────────────
router.get("/faq", async (req, res) => {
  const faqs = await db.select().from(faqTable)
    .where(eq(faqTable.active, true))
    .orderBy(asc(faqTable.sortOrder), asc(faqTable.createdAt));
  res.json(faqs);
});

// ─── ADMIN: All FAQs ──────────────────────────────────────────────────────────
router.get("/admin/faq", async (req, res) => {
  const faqs = await db.select().from(faqTable).orderBy(asc(faqTable.sortOrder), asc(faqTable.createdAt));
  return res.json(faqs);
});

// ─── ADMIN: Create ────────────────────────────────────────────────────────────
router.post("/admin/faq", async (req, res) => {
  const parsed = insertFaqSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Datos inválidos" });
  const [faq] = await db.insert(faqTable).values(parsed.data).returning();
  return res.status(201).json(faq);
});

// ─── ADMIN: Update ────────────────────────────────────────────────────────────
router.patch("/admin/faq/:id", async (req, res) => {
  // Schema parcial derivado del insert: id/createdAt excluidos y claves
  // desconocidas descartadas (anti mass-assignment).
  const parsed = insertFaqSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Datos inválidos", details: parsed.error.issues });
  const [updated] = await db.update(faqTable).set(parsed.data).where(eq(faqTable.id, Number(req.params.id))).returning();
  if (!updated) return res.status(404).json({ error: "No encontrado" });
  return res.json(updated);
});

// ─── ADMIN: Delete ────────────────────────────────────────────────────────────
router.delete("/admin/faq/:id", async (req, res) => {
  await db.delete(faqTable).where(eq(faqTable.id, Number(req.params.id)));
  return res.status(204).send();
});

export default router;

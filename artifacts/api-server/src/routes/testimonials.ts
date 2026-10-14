import { Router, type IRouter } from "express";
import { db, testimonialsTable, insertTestimonialSchema } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { toIsoSafe } from "../lib/date-format";
import { requireAdmin } from "../middleware/require-admin";
import { adminActionLimiter, testimonialLimiter } from "../middleware/rate-limit";

const router: IRouter = Router();

router.get("/testimonials", async (req, res) => {
  try {
    const testimonials = await db
      .select()
      .from(testimonialsTable)
      .orderBy(desc(testimonialsTable.createdAt));
    res.json(testimonials.map(formatTestimonial));
  } catch (err) {
    req.log.error({ err }, "Failed to get testimonials");
    res.status(500).json({ error: "server_error", message: "Failed to get testimonials" });
  }
});

// POST /testimonials — público con rate limit anti-spam
router.post("/testimonials", testimonialLimiter, async (req, res) => {
  try {
    const data = insertTestimonialSchema.parse(req.body);
    const [testimonial] = await db.insert(testimonialsTable).values(data).returning();
    return res.status(201).json(formatTestimonial(testimonial));
  } catch (err) {
    // API-06: validación (Zod) → 400; cualquier otro fallo → 500.
    if (err instanceof Error && err.name === "ZodError") {
      return res.status(400).json({ error: "validation_error", message: "Invalid testimonial data" });
    }
    req.log.error({ err }, "Failed to create testimonial");
    return res.status(500).json({ error: "server_error", message: "No se pudo guardar el testimonio." });
  }
});

router.put("/testimonials/:id", requireAdmin, adminActionLimiter, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const data = insertTestimonialSchema.parse(req.body);
    const [testimonial] = await db.update(testimonialsTable).set(data).where(eq(testimonialsTable.id, id)).returning();
    if (!testimonial) {
      return res.status(404).json({ error: "not_found", message: "Testimonial not found" });
    }
    return res.json(formatTestimonial(testimonial));
  } catch (err) {
    // API-06: validación (Zod) → 400; cualquier otro fallo → 500.
    if (err instanceof Error && err.name === "ZodError") {
      return res.status(400).json({ error: "validation_error", message: "Invalid testimonial data" });
    }
    req.log.error({ err }, "Failed to update testimonial");
    return res.status(500).json({ error: "server_error", message: "No se pudo actualizar el testimonio." });
  }
});

router.delete("/testimonials/:id", requireAdmin, adminActionLimiter, async (req, res) => {
  try {
    const id = Number(req.params.id);
    await db.delete(testimonialsTable).where(eq(testimonialsTable.id, id));
    return res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete testimonial");
    return res.status(500).json({ error: "server_error", message: "Failed to delete testimonial" });
  }
});

function formatTestimonial(t: typeof testimonialsTable.$inferSelect) {
  return {
    id: t.id,
    name: t.name,
    role: t.role,
    message: t.message,
    avatarUrl: t.avatarUrl,
    createdAt: toIsoSafe(t.createdAt),
  };
}

export default router;

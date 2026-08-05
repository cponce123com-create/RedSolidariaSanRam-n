import { Router, type IRouter } from "express";
import { db, testimonialsTable, insertTestimonialSchema } from "@workspace/db";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

router.get("/testimonials", async (req, res) => {
  try {
    const testimonials = await db.select().from(testimonialsTable);
    res.json(testimonials.map(formatTestimonial));
  } catch (err) {
    req.log.error({ err }, "Failed to get testimonials");
    res.status(500).json({ error: "server_error", message: "Failed to get testimonials" });
  }
});

router.post("/testimonials", async (req, res) => {
  try {
    const data = insertTestimonialSchema.parse(req.body);
    const [testimonial] = await db.insert(testimonialsTable).values(data).returning();
    res.status(201).json(formatTestimonial(testimonial));
  } catch (err) {
    req.log.error({ err }, "Failed to create testimonial");
    res.status(400).json({ error: "validation_error", message: "Invalid testimonial data" });
  }
});

router.put("/testimonials/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const data = insertTestimonialSchema.parse(req.body);
    const [testimonial] = await db.update(testimonialsTable).set(data).where(eq(testimonialsTable.id, id)).returning();
    if (!testimonial) {
      return res.status(404).json({ error: "not_found", message: "Testimonial not found" });
    }
    return res.json(formatTestimonial(testimonial));
  } catch (err) {
    req.log.error({ err }, "Failed to update testimonial");
    return res.status(400).json({ error: "validation_error", message: "Invalid testimonial data" });
  }
});

router.delete("/testimonials/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(testimonialsTable).where(eq(testimonialsTable.id, id));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete testimonial");
    res.status(500).json({ error: "server_error", message: "Failed to delete testimonial" });
  }
});

function formatTestimonial(t: typeof testimonialsTable.$inferSelect) {
  return {
    id: t.id,
    name: t.name,
    role: t.role,
    message: t.message,
    avatarUrl: t.avatarUrl,
    createdAt: t.createdAt.toISOString(),
  };
}

export default router;

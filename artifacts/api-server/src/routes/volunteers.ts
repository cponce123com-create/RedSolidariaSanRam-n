import { Router, type IRouter } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import { volunteersTable, insertVolunteerSchema } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";
import { toIsoSafe } from "../lib/date-format";
import { volunteerLimiter } from "../middleware/rate-limit";

const router: IRouter = Router();

// ─── PUBLIC: Submit volunteer application ─────────────────────────────────────
router.post("/volunteers", volunteerLimiter, async (req, res) => {
  try {
    const data = insertVolunteerSchema.parse(req.body);
    const [volunteer] = await db.insert(volunteersTable).values({ ...data, status: "pending" }).returning();
    res.status(201).json(formatVolunteer(volunteer));
  } catch (err) {
    req.log.error({ err }, "Failed to register volunteer");
    res.status(400).json({ error: "validation_error", message: "Datos de voluntario inválidos" });
  }
});

// ─── ADMIN: List all volunteers ───────────────────────────────────────────────
router.get("/admin/volunteers", async (req, res) => {
  const { status } = req.query;
  let query = db.select().from(volunteersTable).$dynamic();
  if (status && status !== "all") query = query.where(eq(volunteersTable.status, status as string));
  const volunteers = await query.orderBy(desc(volunteersTable.createdAt));
  return res.json(volunteers.map(formatVolunteer));
});

// Schema de actualización de voluntarios: status restringido a los estados del
// flujo admin y adminNotes como texto opcional (anti mass-assignment).
const updateVolunteerSchema = z.object({
  status: z.enum(["pending", "reviewing", "approved", "contacted", "rejected"]),
  adminNotes: z.string().optional(),
});

// ─── ADMIN: Update volunteer status ──────────────────────────────────────────
router.patch("/admin/volunteers/:id", async (req, res) => {
  const id = Number(req.params.id);
  const parsed = updateVolunteerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "validation_error", message: "Datos inválidos", details: parsed.error.issues });
  }
  const { status, adminNotes } = parsed.data;
  const [updated] = await db.update(volunteersTable).set({ status, adminNotes }).where(eq(volunteersTable.id, id)).returning();
  if (!updated) return res.status(404).json({ error: "Voluntario no encontrado" });
  return res.json(formatVolunteer(updated));
});

function formatVolunteer(v: typeof volunteersTable.$inferSelect) {
  return {
    id: v.id,
    name: v.name,
    email: v.email,
    phone: v.phone,
    age: v.age,
    district: v.district,
    availability: v.availability,
    skills: v.skills,
    interests: v.interests,
    motivation: v.motivation,
    priorExperience: v.priorExperience,
    status: v.status,
    adminNotes: v.adminNotes,
    photo: v.photo,
    createdAt: toIsoSafe(v.createdAt),
  };
}

export default router;

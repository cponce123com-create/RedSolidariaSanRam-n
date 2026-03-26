import { Router, type IRouter } from "express";
import { db, volunteersTable, insertVolunteerSchema } from "@workspace/db";

const router: IRouter = Router();

router.post("/volunteers", async (req, res) => {
  try {
    const data = insertVolunteerSchema.parse(req.body);
    const [volunteer] = await db.insert(volunteersTable).values(data).returning();
    res.status(201).json(formatVolunteer(volunteer));
  } catch (err) {
    req.log.error({ err }, "Failed to register volunteer");
    res.status(400).json({ error: "validation_error", message: "Invalid volunteer data" });
  }
});

router.get("/volunteers", async (req, res) => {
  try {
    const volunteers = await db.select().from(volunteersTable);
    res.json(volunteers.map(formatVolunteer).reverse());
  } catch (err) {
    req.log.error({ err }, "Failed to get volunteers");
    res.status(500).json({ error: "server_error", message: "Failed to get volunteers" });
  }
});

function formatVolunteer(v: typeof volunteersTable.$inferSelect) {
  return {
    id: v.id,
    name: v.name,
    email: v.email,
    phone: v.phone,
    availability: v.availability,
    skills: v.skills,
    motivation: v.motivation,
    createdAt: v.createdAt.toISOString(),
  };
}

export default router;

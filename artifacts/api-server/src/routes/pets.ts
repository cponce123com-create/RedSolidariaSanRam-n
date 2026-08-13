import { Router } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import { petsTable, insertPetSchema, publicInsertPetSchema, updatePetSchema, adoptionRequestsTable, insertAdoptionRequestSchema } from "@workspace/db/schema";
import { eq, desc, and, or } from "drizzle-orm";
import { adoptionLimiter } from "../middleware/rate-limit";

const router = Router();

// ─── PUBLIC: List available pets ─────────────────────────────────────────────
router.get("/pets", async (req, res) => {
  const { species, sex, ageCategory, size, vaccinated, sterilized, urgent, status } = req.query;
  let query = db.select().from(petsTable).$dynamic();

  const filters: any[] = [eq(petsTable.status, (status as string) || "available")];

  if (species) filters.push(eq(petsTable.species, species as string));
  if (sex) filters.push(eq(petsTable.sex, sex as string));
  if (ageCategory) filters.push(eq(petsTable.ageCategory, ageCategory as string));
  if (size) filters.push(eq(petsTable.size, size as string));
  if (vaccinated === "true") filters.push(eq(petsTable.vaccinated, true));
  if (sterilized === "true") filters.push(eq(petsTable.sterilized, true));
  if (urgent === "true") filters.push(eq(petsTable.urgent, true));

  const pets = await query.where(and(...filters)).orderBy(desc(petsTable.urgent), desc(petsTable.createdAt));
  res.json(pets);
});

// ─── PUBLIC: Get single pet ──────────────────────────────────────────────────
router.get("/pets/:id", async (req, res) => {
  const id = Number(req.params.id);
  const [pet] = await db.select().from(petsTable).where(eq(petsTable.id, id));
  if (!pet) return res.status(404).json({ error: "Mascota no encontrada" });
  return res.json(pet);
});

// ─── PUBLIC: Submit pet for adoption (requires review) ───────────────────────
router.post("/pets/submit", adoptionLimiter, async (req, res) => {
  const parsed = publicInsertPetSchema.safeParse({ ...req.body, status: "reviewing", submittedByPublic: true });
  if (!parsed.success) {
    return res.status(400).json({ error: "Datos inválidos", details: parsed.error.issues });
  }
  const [pet] = await db.insert(petsTable).values({ ...parsed.data, status: "reviewing", submittedByPublic: true }).returning();
  return res.status(201).json(pet);
});

// ─── PUBLIC: Submit adoption request ─────────────────────────────────────────
router.post("/pets/:id/adopt", adoptionLimiter, async (req, res) => {
  const petId = Number(req.params.id);
  const [pet] = await db.select().from(petsTable).where(eq(petsTable.id, petId));
  if (!pet) return res.status(404).json({ error: "Mascota no encontrada" });
  if (pet.status !== "available") return res.status(400).json({ error: "Esta mascota no está disponible para adopción" });

  const parsed = insertAdoptionRequestSchema.safeParse({ ...req.body, petId });
  if (!parsed.success) {
    return res.status(400).json({ error: "Datos inválidos", details: parsed.error.issues });
  }
  const [request] = await db.insert(adoptionRequestsTable).values({ ...parsed.data, status: "pending" }).returning();
  return res.status(201).json(request);
});

// ─── ADMIN: List all pets ─────────────────────────────────────────────────────
router.get("/admin/pets", async (req, res) => {
  const { status } = req.query;
  let query = db.select().from(petsTable).$dynamic();
  if (status && status !== "all") query = query.where(eq(petsTable.status, status as string));
  const pets = await query.orderBy(desc(petsTable.createdAt));
  return res.json(pets);
});

// ─── ADMIN: Get single pet ────────────────────────────────────────────────────
router.get("/admin/pets/:id", async (req, res) => {
  const id = Number(req.params.id);
  const [pet] = await db.select().from(petsTable).where(eq(petsTable.id, id));
  if (!pet) return res.status(404).json({ error: "Mascota no encontrada" });
  return res.json(pet);
});

// ─── ADMIN: Create pet ────────────────────────────────────────────────────────
router.post("/admin/pets", async (req, res) => {
  const parsed = insertPetSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Datos inválidos", details: parsed.error.issues });
  const [pet] = await db.insert(petsTable).values({ ...parsed.data, status: "available" }).returning();
  return res.status(201).json(pet);
});

// ─── ADMIN: Update pet ────────────────────────────────────────────────────────
router.patch("/admin/pets/:id", async (req, res) => {
  const id = Number(req.params.id);
  // updatePetSchema deriva del insert schema: id/createdAt/updatedAt quedan
  // excluidos y las claves desconocidas se descartan (anti mass-assignment).
  const parsed = updatePetSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Datos inválidos", details: parsed.error.issues });
  const [updated] = await db.update(petsTable).set({ ...parsed.data, updatedAt: new Date() }).where(eq(petsTable.id, id)).returning();
  if (!updated) return res.status(404).json({ error: "Mascota no encontrada" });
  return res.json(updated);
});

// ─── ADMIN: Delete pet ────────────────────────────────────────────────────────
router.delete("/admin/pets/:id", async (req, res) => {
  await db.delete(petsTable).where(eq(petsTable.id, Number(req.params.id)));
  return res.status(204).send();
});

// ─── ADMIN: List adoption requests ───────────────────────────────────────────
router.get("/admin/adoption-requests", async (req, res) => {
  const { status, petId } = req.query;
  let query = db.select().from(adoptionRequestsTable).$dynamic();
  const filters: any[] = [];
  if (status && status !== "all") filters.push(eq(adoptionRequestsTable.status, status as string));
  if (petId) filters.push(eq(adoptionRequestsTable.petId, Number(petId)));
  if (filters.length) query = query.where(and(...filters));
  const requests = await query.orderBy(desc(adoptionRequestsTable.createdAt));
  return res.json(requests);
});

// Schema de actualización de solicitudes de adopción: status restringido a los
// estados del flujo admin y adminNotes como texto opcional (anti mass-assignment).
const updateAdoptionRequestSchema = z.object({
  status: z.enum(["pending", "approved", "rejected", "in-process"]),
  adminNotes: z.string().optional(),
});

// ─── ADMIN: Update adoption request status ────────────────────────────────────
router.patch("/admin/adoption-requests/:id", async (req, res) => {
  const id = Number(req.params.id);
  const parsed = updateAdoptionRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "validation_error", message: "Datos inválidos", details: parsed.error.issues });
  }
  const { status, adminNotes } = parsed.data;
  const [updated] = await db.update(adoptionRequestsTable).set({ status, adminNotes }).where(eq(adoptionRequestsTable.id, id)).returning();
  if (!updated) return res.status(404).json({ error: "Solicitud no encontrada" });

  // If approved, mark pet as "adopted"
  if (status === "approved") {
    await db.update(petsTable).set({ status: "adopted", updatedAt: new Date() }).where(eq(petsTable.id, updated.petId));
  }
  // If in-process, mark pet as "in-process"
  if (status === "in-process") {
    await db.update(petsTable).set({ status: "in-process", updatedAt: new Date() }).where(eq(petsTable.id, updated.petId));
  }
  return res.json(updated);
});

export default router;

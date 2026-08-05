import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { donationsTable } from "./donations";

// Comprobantes de donación: capturas del Yape/transferencia (Cloudinary)
export const donationProofsTable = pgTable("donation_proofs", {
  id: serial("id").primaryKey(),
  donationId: integer("donation_id")
    .notNull()
    .references(() => donationsTable.id, { onDelete: "cascade" }),
  imageUrl: text("image_url").notNull(),
  publicId: text("public_id"),
  mimeType: text("mime_type"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertDonationProofSchema = createInsertSchema(
  donationProofsTable,
).omit({ id: true, createdAt: true });
export type InsertDonationProof = z.infer<typeof insertDonationProofSchema>;
export type DonationProof = typeof donationProofsTable.$inferSelect;

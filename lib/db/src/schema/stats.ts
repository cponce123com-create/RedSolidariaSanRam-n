import { pgTable, text, serial, integer, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const statsTable = pgTable("stats", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  intValue: integer("int_value"),
  floatValue: real("float_value"),
});

export const insertStatSchema = createInsertSchema(statsTable).omit({ id: true });
export type InsertStat = z.infer<typeof insertStatSchema>;
export type Stat = typeof statsTable.$inferSelect;

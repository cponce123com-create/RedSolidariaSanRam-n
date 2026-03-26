import { pgTable, serial, text, varchar, timestamp } from "drizzle-orm/pg-core";

export const settings = pgTable("settings", {
  id: serial("id").primaryKey(),
  key: varchar("key", { length: 100 }).notNull().unique(),
  value: text("value"),
  label: varchar("label", { length: 200 }),
  group: varchar("group", { length: 50 }).default("general"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

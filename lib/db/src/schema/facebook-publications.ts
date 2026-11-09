import { sql } from "drizzle-orm";
import { pgTable, serial, text, integer, timestamp, unique, index, check } from "drizzle-orm/pg-core";

// No source FK: keep delivery history after the web content is deleted.
export const facebookPublicationsTable = pgTable("facebook_publications", {
  id: serial("id").primaryKey(),
  sourceType: text("source_type").notNull(),
  sourceId: integer("source_id").notNull(),
  status: text("status").notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
  pageId: text("page_id"), postId: text("post_id"), postUrl: text("post_url"), lastError: text("last_error"),
  nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
  lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [
  unique("facebook_publications_source_unique").on(t.sourceType, t.sourceId),
  index("facebook_publications_pending_idx").on(t.status, t.nextAttemptAt),
  check("facebook_publications_source_check", sql`${t.sourceType} in ('news','campaign')`),
  check("facebook_publications_status_check", sql`${t.status} in ('pending','processing','published','failed','uncertain','cancelled')`),
]);

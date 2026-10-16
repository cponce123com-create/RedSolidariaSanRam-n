import { pgTable, integer, text, jsonb, timestamp } from "drizzle-orm/pg-core";

/**
 * Identidad institucional (Fase 3 del Prompt Maestro).
 *
 * FILA ÚNICA (id = 1): la organización tiene una sola identidad. Se modela con
 * dos columnas JSONB para separar BORRADOR de PUBLICADO:
 *   - `draft`: lo que el superadmin está editando (el público NO lo ve).
 *   - `published`: snapshot que consume la web pública (null = sin publicar).
 *
 * Así «Guardar borrador» y «Publicar» son operaciones distintas y publicar no
 * exige haber terminado de editar. El contenido se normaliza, sanea y valida en
 * la capa de API (`lib/institutional-identity.ts` + `lib/rich-text.ts`), no en
 * la base de datos.
 */
export const institutionalIdentityTable = pgTable("institutional_identity", {
  id: integer("id").primaryKey().default(1),
  draft: jsonb("draft").notNull().default({}),
  published: jsonb("published"),
  publishedAt: timestamp("published_at"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  updatedBy: text("updated_by"),
  /**
   * Control de concurrencia OPTIMISTA (V18): se incrementa en cada guardado y en
   * cada publicación. El cliente envía la versión que leyó; si no coincide, la API
   * responde 409 y NO escribe nada (dos pestañas no se pisan el borrador).
   */
  version: integer("version").notNull().default(1),
});

export type InstitutionalIdentityRow =
  typeof institutionalIdentityTable.$inferSelect;

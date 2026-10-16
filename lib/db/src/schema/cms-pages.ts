import {
  pgTable,
  serial,
  integer,
  text,
  jsonb,
  timestamp,
  index,
} from "drizzle-orm/pg-core";

/**
 * CMS institucional (Fase 2 del Prompt Maestro del CMS).
 *
 * Reutiliza EXACTAMENTE el patrón ya probado de `institutional_identity`:
 * BORRADOR y PUBLICADO viven en columnas JSONB separadas, de modo que «Guardar
 * borrador» y «Publicar» son operaciones distintas y publicar no obliga a haber
 * terminado de editar.
 *
 *   - `draft`: lo que el superadmin está editando (el público NO lo ve).
 *   - `published`: snapshot que consume la web pública (null = sin publicar).
 *
 * La clave es el `slug` de la página (`inicio`, `historia`, `menu`, …). El
 * contenido se normaliza, sanea y valida en la capa de API (`lib/cms-content.ts`
 * + `lib/rich-text.ts`), nunca en la base de datos: la BD solo almacena.
 */
export const cmsPagesTable = pgTable("cms_pages", {
  slug: text("slug").primaryKey(),
  draft: jsonb("draft").notNull().default({}),
  published: jsonb("published"),
  /**
   * Estado de publicación:
   *   - `draft`: hay borrador, sin publicar (o despublicado).
   *   - `published`: lo publicado es lo que ve la web.
   *   - `scheduled`: hay una publicación PROGRAMADA para `scheduled_at`.
   */
  status: text("status").notNull().default("draft"),
  publishedAt: timestamp("published_at"),
  /** Fecha/hora en que debe publicarse sola (publicación programada). */
  scheduledAt: timestamp("scheduled_at"),
  /**
   * Control de concurrencia OPTIMISTA: se incrementa en cada guardado y en cada
   * publicación. El cliente envía la versión que leyó; si no coincide, la API
   * responde 409 y NO escribe nada (dos pestañas no se pisan el borrador).
   */
  version: integer("version").notNull().default(1),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  updatedBy: text("updated_by"),
});

/**
 * Historial de versiones por página. Se guarda un snapshot del contenido en cada
 * acción relevante (guardar borrador, publicar, despublicar, programar,
 * restaurar) para poder AUDITAR y RESTAURAR una versión anterior.
 *
 * Es un histórico: nunca se actualiza ni se borra desde el panel.
 */
export const cmsPageVersionsTable = pgTable(
  "cms_page_versions",
  {
    id: serial("id").primaryKey(),
    slug: text("slug").notNull(),
    version: integer("version").notNull(),
    content: jsonb("content").notNull(),
    /** draft | publish | unpublish | schedule | restore */
    action: text("action").notNull(),
    note: text("note"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    createdBy: text("created_by"),
  },
  (table) => ({
    slugVersionIdx: index("idx_cms_page_versions_slug").on(
      table.slug,
      table.version,
    ),
  }),
);

export type CmsPageRow = typeof cmsPagesTable.$inferSelect;
export type CmsPageVersionRow = typeof cmsPageVersionsTable.$inferSelect;

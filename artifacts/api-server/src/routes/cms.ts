import { Router, type IRouter } from "express";
import { db, cmsPagesTable, cmsPageVersionsTable } from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import { requireRole, ROLES } from "../middleware/roles";
import { logAuditAction } from "../middleware/auth-utils";
import { AUDIT_ACTIONS, AUDIT_RESOURCES, auditContext } from "../lib/audit";
import {
  cleanupCloudinaryAssetsByPublicId,
  type CleanupLogger,
} from "../lib/asset-cleanup";
import {
  CMS_PAGE_SLUGS,
  cmsPageBlockSchema,
  cmsPageIsWired,
  cmsPageTitle,
  collectAssetPublicIds,
  diffRemovedAssets,
  hasPendingChanges,
  isCmsPageSlug,
  isOwnedCmsPublicId,
  isPageEmpty,
  normalizePage,
  publicPageDto,
  validatePage,
  type CmsPageContent,
} from "../lib/cms-content";

/**
 * CMS institucional (Fase 2–3).
 *
 * PÚBLICO: `GET /cms/pages/:slug` devuelve SOLO lo publicado, con un DTO de allowlist
 * explícita (`publicPageDto`), o `null` si no hay nada publicado (entonces el
 * frontend usa su contenido por defecto de i18n y la web no se rompe).
 *
 * ADMIN (superadmin): borrador + publicado con CONTROL DE VERSIÓN. Cada escritura
 * incrementa `version`; si la versión que envía el cliente no coincide, responde 409
 * y NO escribe nada (dos pestañas no se pisan el borrador).
 *
 * PUBLICAR GUARDA: `POST /publish` acepta el contenido pendiente y lo guarda y
 * publica en UNA transacción, de modo que se publica EXACTAMENTE lo guardado.
 *
 * HISTORIAL: cada acción relevante deja un snapshot en `cms_page_versions`, que
 * permite auditar y RESTAURAR una versión anterior.
 *
 * ASSETS: al reemplazar una imagen, el archivo ANTERIOR no se borra hasta confirmar
 * el guardado/publicación; entonces se limpia best-effort y SOLO si es de nuestras
 * carpetas (`cms/...`).
 */
const router: IRouter = Router();

/** Estado público de una página para el listado del panel. */
interface PageSummary {
  slug: string;
  title: string;
  wired: boolean;
  status: string;
  version: number;
  publishedAt: Date | null;
  scheduledAt: Date | null;
  updatedAt: Date | null;
  updatedBy: string | null;
  hasPendingChanges: boolean;
}

async function readRow(slug: string) {
  const [row] = await db.select().from(cmsPagesTable).where(eq(cmsPagesTable.slug, slug));
  return row ?? null;
}

function toVersion(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isInteger(n) && n >= 1 ? n : null;
}

function draftOf(slug: string, row: Awaited<ReturnType<typeof readRow>> | null): CmsPageContent {
  return normalizePage(slug, row?.draft ?? {}) ?? { blocks: [] };
}

function publishedOf(
  slug: string,
  row: Awaited<ReturnType<typeof readRow>> | null,
): CmsPageContent | null {
  return row?.published ? normalizePage(slug, row.published) : null;
}

/** Estado completo del servidor (para el panel y para resolver un 409). */
function serverState(slug: string, row: Awaited<ReturnType<typeof readRow>> | null) {
  const draft = draftOf(slug, row);
  const published = publishedOf(slug, row);
  return {
    slug,
    title: cmsPageTitle(slug),
    wired: cmsPageIsWired(slug),
    blocks: cmsPageBlockSchema(slug),
    draft,
    published: row?.published ? publicPageDto(slug, row.published, row.publishedAt) : null,
    status: row?.status ?? "draft",
    version: row?.version ?? 1,
    publishedAt: row?.publishedAt ?? null,
    scheduledAt: row?.scheduledAt ?? null,
    updatedAt: row?.updatedAt ?? null,
    updatedBy: row?.updatedBy ?? null,
    hasPendingChanges: hasPendingChanges(draft, published),
  };
}

/** Guarda un snapshot en el historial (nunca se actualiza ni se borra). */
async function recordVersion(
  slug: string,
  version: number,
  content: CmsPageContent,
  action: string,
  actor: { username: string | null },
  note?: string | null,
): Promise<void> {
  await db.insert(cmsPageVersionsTable).values({
    slug,
    version,
    content,
    action,
    note: note ?? null,
    createdBy: actor.username ?? null,
  });
}

/** Borra activos de nuestras carpetas de forma BEST-EFFORT y SIEMPRE tras el commit. */
async function cleanupCmsAssets(
  publicIds: readonly string[],
  log: CleanupLogger,
): Promise<{ deleted: number; failed: string[] }> {
  const owned = publicIds.filter((id) => isOwnedCmsPublicId(id));
  if (owned.length === 0) return { deleted: 0, failed: [] };
  const result = await cleanupCloudinaryAssetsByPublicId(owned, log);
  if (result.deleted > 0 || result.failed.length > 0 || result.skipped > 0) {
    log.info?.(
      { deleted: result.deleted, failed: result.failed, skipped: result.skipped },
      "Limpieza de activos del CMS",
    );
  }
  return { deleted: result.deleted, failed: result.failed };
}

const cleanupLog = (req: { log: unknown }): CleanupLogger => req.log as CleanupLogger;

/**
 * Publicación PROGRAMADA perezosa. En Render Free no hay cron: al leer una página
 * cuya `scheduled_at` ya venció, se materializa la publicación (una sola vez, de
 * forma idempotente). Si el guardado falla, la lectura sigue devolviendo lo anterior.
 */
async function materializeScheduled(
  slug: string,
  row: Awaited<ReturnType<typeof readRow>>,
  log: CleanupLogger,
): Promise<Awaited<ReturnType<typeof readRow>>> {
  if (!row || row.status !== "scheduled" || !row.scheduledAt) return row;
  if (row.scheduledAt.getTime() > Date.now()) return row;

  const draft = draftOf(slug, row);
  if (isPageEmpty(draft)) return row;

  const now = new Date();
  const nextVersion = (row.version ?? 1) + 1;
  try {
    await db
      .update(cmsPagesTable)
      .set({
        published: draft,
        status: "published",
        publishedAt: now,
        scheduledAt: null,
        version: nextVersion,
        updatedAt: now,
        updatedBy: "programado",
      })
      .where(eq(cmsPagesTable.slug, slug));
    await recordVersion(slug, nextVersion, draft, "publish", { username: "programado" }, "Publicación programada");
    log.info?.({ slug }, "Publicación programada materializada");
    return await readRow(slug);
  } catch (err) {
    log.warn({ err, slug }, "No se pudo materializar la publicación programada");
    return row;
  }
}

// ─── PÚBLICO: página PUBLICADA (allowlist explícita) ─────────────────────────
router.get("/cms/pages/:slug", async (req, res) => {
  const slug = String(req.params.slug);
  if (!isCmsPageSlug(slug)) {
    return res.status(404).json({ error: "not_found", message: "Página no encontrada." });
  }
  try {
    let row = await readRow(slug);
    row = await materializeScheduled(slug, row, cleanupLog(req));
    return res.json(publicPageDto(slug, row?.published ?? null, row?.publishedAt ?? null));
  } catch (err) {
    req.log.error({ err, slug }, "Failed to get CMS page");
    return res.status(500).json({ error: "server_error", message: "No se pudo cargar la página." });
  }
});

// ─── ADMIN (superadmin): listado de páginas ──────────────────────────────────
router.get("/admin/cms/pages", requireRole(ROLES.SUPERADMIN), async (req, res) => {
  try {
    const rows = await db.select().from(cmsPagesTable);
    const bySlug = new Map(rows.map((row) => [row.slug, row]));
    const pages: PageSummary[] = CMS_PAGE_SLUGS.map((slug) => {
      const row = bySlug.get(slug) ?? null;
      const draft = draftOf(slug, row);
      const published = publishedOf(slug, row);
      return {
        slug,
        title: cmsPageTitle(slug),
        wired: cmsPageIsWired(slug),
        status: row?.status ?? "draft",
        version: row?.version ?? 1,
        publishedAt: row?.publishedAt ?? null,
        scheduledAt: row?.scheduledAt ?? null,
        updatedAt: row?.updatedAt ?? null,
        updatedBy: row?.updatedBy ?? null,
        hasPendingChanges: hasPendingChanges(draft, published),
      };
    });
    res.setHeader("Cache-Control", "private, no-store");
    return res.json({ pages });
  } catch (err) {
    req.log.error({ err }, "Failed to list CMS pages");
    return res.status(500).json({ error: "server_error", message: "No se pudieron cargar las páginas." });
  }
});

// ─── ADMIN (superadmin): detalle de una página ───────────────────────────────
router.get("/admin/cms/pages/:slug", requireRole(ROLES.SUPERADMIN), async (req, res) => {
  const slug = String(req.params.slug);
  if (!isCmsPageSlug(slug)) {
    return res.status(404).json({ error: "not_found", message: "Página no encontrada." });
  }
  try {
    const row = await materializeScheduled(slug, await readRow(slug), cleanupLog(req));
    res.setHeader("Cache-Control", "private, no-store");
    return res.json(serverState(slug, row));
  } catch (err) {
    req.log.error({ err, slug }, "Failed to get CMS page (admin)");
    return res.status(500).json({ error: "server_error", message: "No se pudo cargar la página." });
  }
});

// ─── ADMIN (superadmin): guardar BORRADOR ────────────────────────────────────
router.put("/admin/cms/pages/:slug", requireRole(ROLES.SUPERADMIN), async (req, res) => {
  const slug = String(req.params.slug);
  if (!isCmsPageSlug(slug)) {
    return res.status(404).json({ error: "not_found", message: "Página no encontrada." });
  }
  try {
    const body = (req.body ?? {}) as { content?: unknown; version?: unknown };
    const content = normalizePage(slug, body.content ?? {});
    if (!content) {
      return res.status(404).json({ error: "not_found", message: "Página no encontrada." });
    }
    const errors = validatePage(content);
    if (errors.length > 0) {
      return res.status(400).json({ error: "validation_error", message: errors.join(" ") });
    }

    const row = await readRow(slug);
    const actual = row?.version ?? 1;
    const expected = toVersion(body.version);
    if (expected !== null && expected !== actual) {
      return res.status(409).json({
        error: "conflict",
        code: "version_conflict",
        message: "Otra sesión modificó esta página. Recarga para no perder cambios.",
        current: serverState(slug, row),
      });
    }

    const nextVersion = actual + 1;
    const actor = auditContext(req);
    const [updated] = await db
      .insert(cmsPagesTable)
      .values({
        slug,
        draft: content,
        version: nextVersion,
        status: row?.status === "scheduled" ? "scheduled" : (row?.status ?? "draft"),
        updatedBy: actor.username ?? null,
      })
      .onConflictDoUpdate({
        target: cmsPagesTable.slug,
        set: { draft: content, version: nextVersion, updatedAt: new Date(), updatedBy: actor.username ?? null },
      })
      .returning();

    await recordVersion(slug, nextVersion, content, "draft", actor);
    await logAuditAction({
      ...actor,
      action: AUDIT_ACTIONS.cmsUpdated,
      resource: AUDIT_RESOURCES.cms,
      resourceId: slug,
      details: { version: nextVersion, blocks: content.blocks.length },
    });

    const published = publishedOf(slug, row);
    const removed = diffRemovedAssets(draftOf(slug, row), content, published);
    const cleanup = await cleanupCmsAssets(removed, cleanupLog(req));

    return res.json({
      draft: content,
      version: updated?.version ?? nextVersion,
      updatedAt: updated?.updatedAt ?? null,
      hasPendingChanges: hasPendingChanges(content, published),
      removedAssets: cleanup,
    });
  } catch (err) {
    req.log.error({ err, slug }, "Failed to save CMS draft");
    return res.status(500).json({ error: "server_error", message: "No se pudo guardar el borrador." });
  }
});

// ─── ADMIN (superadmin): PUBLICAR (guarda y publica en UNA transacción) ──────
router.post("/admin/cms/pages/:slug/publish", requireRole(ROLES.SUPERADMIN), async (req, res) => {
  const slug = String(req.params.slug);
  if (!isCmsPageSlug(slug)) {
    return res.status(404).json({ error: "not_found", message: "Página no encontrada." });
  }
  try {
    const body = (req.body ?? {}) as { content?: unknown; version?: unknown };
    const row = await readRow(slug);
    const actual = row?.version ?? 1;
    const expected = toVersion(body.version);
    if (expected !== null && expected !== actual) {
      return res.status(409).json({
        error: "conflict",
        code: "version_conflict",
        message: "Otra sesión modificó esta página. Recarga para no publicar datos viejos.",
        current: serverState(slug, row),
      });
    }

    const nextDraft =
      body.content !== undefined ? normalizePage(slug, body.content) : draftOf(slug, row);
    if (!nextDraft) {
      return res.status(404).json({ error: "not_found", message: "Página no encontrada." });
    }
    const errors = validatePage(nextDraft);
    if (errors.length > 0) {
      return res.status(400).json({ error: "validation_error", message: errors.join(" ") });
    }
    if (isPageEmpty(nextDraft)) {
      return res.status(400).json({
        error: "empty_content",
        message: "No hay contenido que publicar. Añade al menos un texto o una imagen.",
      });
    }

    const now = new Date();
    const nextVersion = actual + 1;
    const actor = auditContext(req);
    await db.transaction(async (tx) => {
      await tx
        .insert(cmsPagesTable)
        .values({
          slug,
          draft: nextDraft,
          published: nextDraft,
          status: "published",
          publishedAt: now,
          scheduledAt: null,
          version: nextVersion,
          updatedBy: actor.username ?? null,
        })
        .onConflictDoUpdate({
          target: cmsPagesTable.slug,
          set: {
            draft: nextDraft,
            published: nextDraft,
            status: "published",
            publishedAt: now,
            scheduledAt: null,
            version: nextVersion,
            updatedAt: now,
            updatedBy: actor.username ?? null,
          },
        });
    });

    await recordVersion(slug, nextVersion, nextDraft, "publish", actor);
    await logAuditAction({
      ...actor,
      action: AUDIT_ACTIONS.cmsPublished,
      resource: AUDIT_RESOURCES.cms,
      resourceId: slug,
      details: { version: nextVersion, savedAndPublished: true },
    });

    // AHORA sí: lo publicado anterior ya no se usa → se limpian los reemplazados.
    const removed = diffRemovedAssets(publishedOf(slug, row), nextDraft, nextDraft);
    const cleanup = await cleanupCmsAssets(removed, cleanupLog(req));

    return res.json({
      draft: nextDraft,
      published: publicPageDto(slug, nextDraft, now),
      status: "published",
      version: nextVersion,
      publishedAt: now,
      hasPendingChanges: false,
      removedAssets: cleanup,
    });
  } catch (err) {
    req.log.error({ err, slug }, "Failed to publish CMS page");
    return res.status(500).json({ error: "server_error", message: "No se pudo publicar la página." });
  }
});

// ─── ADMIN (superadmin): DESPUBLICAR (conserva el borrador y los assets) ─────
router.post("/admin/cms/pages/:slug/unpublish", requireRole(ROLES.SUPERADMIN), async (req, res) => {
  const slug = String(req.params.slug);
  if (!isCmsPageSlug(slug)) {
    return res.status(404).json({ error: "not_found", message: "Página no encontrada." });
  }
  try {
    const row = await readRow(slug);
    const actual = row?.version ?? 1;
    const expected = toVersion((req.body ?? {}).version);
    if (expected !== null && expected !== actual) {
      return res.status(409).json({
        error: "conflict",
        code: "version_conflict",
        message: "Otra sesión modificó esta página. Recarga para continuar.",
        current: serverState(slug, row),
      });
    }

    const now = new Date();
    const nextVersion = actual + 1;
    const actor = auditContext(req);
    await db
      .insert(cmsPagesTable)
      .values({
        slug,
        published: null,
        status: "draft",
        publishedAt: null,
        scheduledAt: null,
        version: nextVersion,
        updatedBy: actor.username ?? null,
      })
      .onConflictDoUpdate({
        target: cmsPagesTable.slug,
        set: {
          published: null,
          status: "draft",
          publishedAt: null,
          scheduledAt: null,
          version: nextVersion,
          updatedAt: now,
          updatedBy: actor.username ?? null,
        },
      });

    const draft = draftOf(slug, row);
    await recordVersion(slug, nextVersion, draft, "unpublish", actor);
    await logAuditAction({
      ...actor,
      action: AUDIT_ACTIONS.cmsUnpublished,
      resource: AUDIT_RESOURCES.cms,
      resourceId: slug,
      details: { version: nextVersion },
    });

    return res.json({
      draft,
      published: null,
      status: "draft",
      publishedAt: null,
      version: nextVersion,
      hasPendingChanges: !isPageEmpty(draft),
    });
  } catch (err) {
    req.log.error({ err, slug }, "Failed to unpublish CMS page");
    return res.status(500).json({ error: "server_error", message: "No se pudo despublicar la página." });
  }
});

// ─── ADMIN (superadmin): PROGRAMAR publicación ───────────────────────────────
router.post("/admin/cms/pages/:slug/schedule", requireRole(ROLES.SUPERADMIN), async (req, res) => {
  const slug = String(req.params.slug);
  if (!isCmsPageSlug(slug)) {
    return res.status(404).json({ error: "not_found", message: "Página no encontrada." });
  }
  try {
    const body = (req.body ?? {}) as { content?: unknown; version?: unknown; scheduledAt?: unknown };
    const scheduledAt = new Date(String(body.scheduledAt ?? ""));
    if (Number.isNaN(scheduledAt.getTime()) || scheduledAt.getTime() <= Date.now()) {
      return res.status(400).json({
        error: "validation_error",
        message: "Indica una fecha futura válida para programar la publicación.",
      });
    }

    const row = await readRow(slug);
    const actual = row?.version ?? 1;
    const expected = toVersion(body.version);
    if (expected !== null && expected !== actual) {
      return res.status(409).json({
        error: "conflict",
        code: "version_conflict",
        message: "Otra sesión modificó esta página. Recarga para no programar datos viejos.",
        current: serverState(slug, row),
      });
    }

    const nextDraft =
      body.content !== undefined ? normalizePage(slug, body.content) : draftOf(slug, row);
    if (!nextDraft) {
      return res.status(404).json({ error: "not_found", message: "Página no encontrada." });
    }
    const errors = validatePage(nextDraft);
    if (errors.length > 0) {
      return res.status(400).json({ error: "validation_error", message: errors.join(" ") });
    }
    if (isPageEmpty(nextDraft)) {
      return res.status(400).json({
        error: "empty_content",
        message: "No hay contenido que programar. Añade al menos un texto o una imagen.",
      });
    }

    const now = new Date();
    const nextVersion = actual + 1;
    const actor = auditContext(req);
    await db
      .insert(cmsPagesTable)
      .values({
        slug,
        draft: nextDraft,
        status: "scheduled",
        scheduledAt,
        version: nextVersion,
        updatedBy: actor.username ?? null,
      })
      .onConflictDoUpdate({
        target: cmsPagesTable.slug,
        set: {
          draft: nextDraft,
          status: "scheduled",
          scheduledAt,
          version: nextVersion,
          updatedAt: now,
          updatedBy: actor.username ?? null,
        },
      });

    await recordVersion(slug, nextVersion, nextDraft, "schedule", actor, scheduledAt.toISOString());
    await logAuditAction({
      ...actor,
      action: AUDIT_ACTIONS.cmsScheduled,
      resource: AUDIT_RESOURCES.cms,
      resourceId: slug,
      details: { version: nextVersion, scheduledAt: scheduledAt.toISOString() },
    });

    return res.json({
      draft: nextDraft,
      status: "scheduled",
      scheduledAt,
      version: nextVersion,
      hasPendingChanges: hasPendingChanges(nextDraft, publishedOf(slug, row)),
    });
  } catch (err) {
    req.log.error({ err, slug }, "Failed to schedule CMS page");
    return res.status(500).json({ error: "server_error", message: "No se pudo programar la publicación." });
  }
});

// ─── ADMIN (superadmin): HISTORIAL de versiones ──────────────────────────────
router.get("/admin/cms/pages/:slug/versions", requireRole(ROLES.SUPERADMIN), async (req, res) => {
  const slug = String(req.params.slug);
  if (!isCmsPageSlug(slug)) {
    return res.status(404).json({ error: "not_found", message: "Página no encontrada." });
  }
  try {
    const rows = await db
      .select()
      .from(cmsPageVersionsTable)
      .where(eq(cmsPageVersionsTable.slug, slug))
      .orderBy(desc(cmsPageVersionsTable.version), desc(cmsPageVersionsTable.id))
      .limit(30);
    res.setHeader("Cache-Control", "private, no-store");
    return res.json({
      versions: rows.map((row) => ({
        id: row.id,
        version: row.version,
        action: row.action,
        note: row.note,
        createdAt: row.createdAt,
        createdBy: row.createdBy,
      })),
    });
  } catch (err) {
    req.log.error({ err, slug }, "Failed to list CMS versions");
    return res.status(500).json({ error: "server_error", message: "No se pudo cargar el historial." });
  }
});

// ─── ADMIN (superadmin): RESTAURAR una versión al borrador ───────────────────
router.post("/admin/cms/pages/:slug/restore", requireRole(ROLES.SUPERADMIN), async (req, res) => {
  const slug = String(req.params.slug);
  if (!isCmsPageSlug(slug)) {
    return res.status(404).json({ error: "not_found", message: "Página no encontrada." });
  }
  try {
    const body = (req.body ?? {}) as { versionId?: unknown; version?: unknown };
    const versionId = Number(body.versionId);
    if (!Number.isInteger(versionId) || versionId <= 0) {
      return res.status(400).json({ error: "validation_error", message: "Versión inválida." });
    }

    const [snapshot] = await db
      .select()
      .from(cmsPageVersionsTable)
      .where(eq(cmsPageVersionsTable.id, versionId));
    if (!snapshot || snapshot.slug !== slug) {
      return res.status(404).json({ error: "not_found", message: "Esa versión no existe para esta página." });
    }

    const restored = normalizePage(slug, snapshot.content);
    if (!restored) {
      return res.status(400).json({ error: "validation_error", message: "La versión no se puede restaurar." });
    }

    const row = await readRow(slug);
    const actual = row?.version ?? 1;
    const expected = toVersion(body.version);
    if (expected !== null && expected !== actual) {
      return res.status(409).json({
        error: "conflict",
        code: "version_conflict",
        message: "Otra sesión modificó esta página. Recarga antes de restaurar.",
        current: serverState(slug, row),
      });
    }

    // Restaurar NO publica: deja la versión elegida como BORRADOR para revisarla.
    const nextVersion = actual + 1;
    const actor = auditContext(req);
    await db
      .insert(cmsPagesTable)
      .values({
        slug,
        draft: restored,
        version: nextVersion,
        status: row?.status === "published" ? "published" : (row?.status ?? "draft"),
        updatedBy: actor.username ?? null,
      })
      .onConflictDoUpdate({
        target: cmsPagesTable.slug,
        set: { draft: restored, version: nextVersion, updatedAt: new Date(), updatedBy: actor.username ?? null },
      });

    await recordVersion(slug, nextVersion, restored, "restore", actor, `restaurada v${snapshot.version}`);
    await logAuditAction({
      ...actor,
      action: AUDIT_ACTIONS.cmsVersionRestored,
      resource: AUDIT_RESOURCES.cms,
      resourceId: slug,
      details: { version: nextVersion, restoredFrom: snapshot.version, snapshotId: snapshot.id },
    });

    return res.json({
      draft: restored,
      version: nextVersion,
      restoredFrom: snapshot.version,
      hasPendingChanges: hasPendingChanges(restored, publishedOf(slug, row)),
    });
  } catch (err) {
    req.log.error({ err, slug }, "Failed to restore CMS version");
    return res.status(500).json({ error: "server_error", message: "No se pudo restaurar la versión." });
  }
});

/**
 * POST /admin/cms/assets/discard — anti-huérfanos.
 *
 * Cuando el panel sube una imagen y la REEMPLAZA antes de guardar, el archivo subido
 * quedaría huérfano. El panel envía aquí la página y los publicIds que ya no usa; el
 * servidor borra SOLO los que (a) son de nuestras carpetas `cms/` y (b) NO están
 * referenciados por el borrador ni por lo publicado. Nunca toca nada en uso.
 */
router.post("/admin/cms/assets/discard", requireRole(ROLES.SUPERADMIN), async (req, res) => {
  const slug = String((req.body ?? {}).page ?? "");
  if (!isCmsPageSlug(slug)) {
    return res.status(400).json({ error: "validation_error", message: "Indica una página válida." });
  }
  try {
    const body = (req.body ?? {}) as { publicIds?: unknown };
    const requested = Array.isArray(body.publicIds)
      ? body.publicIds.filter((id): id is string => typeof id === "string" && id.length > 0)
      : [];
    if (requested.length === 0) {
      return res.status(400).json({ error: "validation_error", message: "Indica al menos un publicId a descartar." });
    }

    const row = await readRow(slug);
    const referenced = new Set([
      ...collectAssetPublicIds(draftOf(slug, row)),
      ...collectAssetPublicIds(publishedOf(slug, row)),
    ]);
    const toDelete = requested.filter((id) => isOwnedCmsPublicId(id) && !referenced.has(id));
    const cleanup = await cleanupCmsAssets(toDelete, cleanupLog(req));

    const actor = auditContext(req);
    await logAuditAction({
      ...actor,
      action: AUDIT_ACTIONS.cmsAssetsDiscarded,
      resource: AUDIT_RESOURCES.cms,
      resourceId: slug,
      details: {
        requested: requested.length,
        discarded: cleanup.deleted,
        skipped: requested.length - toDelete.length,
        failed: cleanup.failed,
      },
    });

    return res.json({
      discarded: cleanup.deleted,
      failed: cleanup.failed,
      skipped: requested.length - toDelete.length,
    });
  } catch (err) {
    req.log.error({ err, slug }, "Failed to discard CMS assets");
    return res.status(500).json({ error: "server_error", message: "No se pudieron descartar los archivos." });
  }
});

export default router;

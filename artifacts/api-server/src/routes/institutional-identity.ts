import { Router, type IRouter } from "express";
import { db, institutionalIdentityTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireRole, ROLES } from "../middleware/roles";
import { logAuditAction } from "../middleware/auth-utils";
import { AUDIT_ACTIONS, AUDIT_RESOURCES, auditContext } from "../lib/audit";
import {
  cleanupCloudinaryAssetsByPublicId,
  extractCloudinaryPublicId,
  type CleanupLogger,
} from "../lib/asset-cleanup";
import {
  collectAssetPublicIds,
  diffRemovedAssets,
  emptyContent,
  hasPendingChanges,
  isContentEmpty,
  isOwnedPublicId,
  normalizeContent,
  publicIdentityDto,
  validateContent,
  type InstitutionalIdentityContent,
} from "../lib/institutional-identity";

/**
 * Identidad institucional (Fase 3 · V18).
 *
 * PÚBLICO: `GET /institutional-identity` devuelve SOLO lo publicado, con un DTO de
 * allowlist explícita.
 *
 * ADMIN (superadmin): borrador + publicado con CONTROL DE VERSIÓN. Cada escritura
 * incrementa `version` y el cliente debe enviar la versión que leyó; si no coincide,
 * responde 409 y NO escribe nada (dos pestañas no se pisan el borrador).
 *
 * PUBLICAR GUARDA: `POST /publish` acepta el contenido pendiente y lo guarda y
 * publica en UNA transacción, de modo que se publica EXACTAMENTE lo guardado (antes
 * publicaba el borrador que ya estuviera en el servidor, y si no habías guardado se
 * publicaba la versión vieja mostrando éxito).
 *
 * ASSETS: al reemplazar una imagen, el archivo ANTERIOR no se borra hasta confirmar
 * el guardado/publicación; entonces se limpia best-effort y SOLO si es de nuestras
 * carpetas (`institutional-identity/...`).
 */
const router: IRouter = Router();

/** La identidad es una fila única: id = 1 (restricción CHECK en la migración 031). */
const SINGLE_ROW_ID = 1;

/** Lee la fila única. Devuelve null si aún no existe (BD recién migrada). */
async function readRow() {
  const [row] = await db
    .select()
    .from(institutionalIdentityTable)
    .where(eq(institutionalIdentityTable.id, SINGLE_ROW_ID));
  return row ?? null;
}

/** Versión enviada por el cliente (entero ≥ 1) o null si no la envió. */
function toVersion(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isInteger(n) && n >= 1 ? n : null;
}

function rowContent(row: Awaited<ReturnType<typeof readRow>>) {
  const draft = normalizeContent(row?.draft ?? emptyContent());
  const published = row?.published ? normalizeContent(row.published) : null;
  return { draft, published };
}

/** Estado completo del servidor, para resolver un conflicto de versión en el panel. */
function serverState(row: Awaited<ReturnType<typeof readRow>>) {
  const { draft, published } = rowContent(row);
  return {
    version: row?.version ?? 1,
    draft,
    published: row?.published ? publicIdentityDto(row.published, row.publishedAt) : null,
    publishedAt: row?.publishedAt ?? null,
    updatedAt: row?.updatedAt ?? null,
    updatedBy: row?.updatedBy ?? null,
    hasPendingChanges: hasPendingChanges(draft, published),
  };
}

/**
 * Borra activos de nuestras carpetas de forma BEST-EFFORT y SIEMPRE después del
 * commit: si Cloudinary falla, la base ya quedó consistente y el activo se puede
 * limpiar manualmente. Nunca toca archivos que no sean nuestros.
 */
async function cleanupIdentityAssets(
  publicIds: readonly string[],
  log: CleanupLogger,
): Promise<{ deleted: number; failed: string[] }> {
  const owned = publicIds.filter((id) => isOwnedPublicId(id));
  if (owned.length === 0) return { deleted: 0, failed: [] };
  const result = await cleanupCloudinaryAssetsByPublicId(owned, log);
  if (result.deleted > 0 || result.failed.length > 0 || result.skipped > 0) {
    log.info?.(
      { deleted: result.deleted, failed: result.failed, skipped: result.skipped },
      "Limpieza de activos de identidad institucional",
    );
  }
  return { deleted: result.deleted, failed: result.failed };
}

const cleanupLog = (req: { log: unknown }): CleanupLogger => req.log as CleanupLogger;

// ─── PÚBLICO: identidad PUBLICADA (allowlist explícita de campos) ─────────────
router.get("/institutional-identity", async (req, res) => {
  try {
    const row = await readRow();
    // Si no hay nada publicado devuelve `null`: el frontend usa su contenido por
    // defecto (no rompe la página «Nosotros»).
    res.json(publicIdentityDto(row?.published ?? null, row?.publishedAt ?? null));
  } catch (err) {
    req.log.error({ err }, "Failed to get institutional identity");
    res.status(500).json({
      error: "server_error",
      message: "No se pudo cargar la identidad institucional.",
    });
  }
});

// ─── ADMIN (superadmin): borrador + publicado + versión ──────────────────────
router.get(
  "/admin/institutional-identity",
  requireRole(ROLES.SUPERADMIN),
  async (req, res) => {
    try {
      const row = await readRow();
      res.setHeader("Cache-Control", "private, no-store");
      res.json(serverState(row));
    } catch (err) {
      req.log.error({ err }, "Failed to get institutional identity (admin)");
      res.status(500).json({
        error: "server_error",
        message: "No se pudo cargar la identidad institucional.",
      });
    }
  },
);

// ─── ADMIN (superadmin): guardar BORRADOR ────────────────────────────────────
router.put(
  "/admin/institutional-identity",
  requireRole(ROLES.SUPERADMIN),
  async (req, res) => {
    try {
      const body = (req.body ?? {}) as { content?: unknown; version?: unknown };
      // `content` explícito; si no viene, se acepta el cuerpo como contenido (compat).
      const content = normalizeContent(body.content ?? body);
      const errors = validateContent(content);
      if (errors.length > 0) {
        return res.status(400).json({ error: "validation_error", message: errors.join(" ") });
      }

      const row = await readRow();
      const actual = row?.version ?? 1;
      const expected = toVersion(body.version);
      if (expected !== null && expected !== actual) {
        return res.status(409).json({
          error: "conflict",
          code: "version_conflict",
          message:
            "Otra sesión modificó la identidad institucional. Recarga para no perder cambios.",
          current: serverState(row),
        });
      }

      const nextVersion = actual + 1;
      const actor = auditContext(req);
      const [updated] = await db
        .insert(institutionalIdentityTable)
        .values({ id: SINGLE_ROW_ID, draft: content, version: nextVersion, updatedBy: actor.username ?? null })
        .onConflictDoUpdate({
          target: institutionalIdentityTable.id,
          set: {
            draft: content,
            version: nextVersion,
            updatedAt: new Date(),
            updatedBy: actor.username ?? null,
          },
        })
        .returning();

      await logAuditAction({
        ...actor,
        action: AUDIT_ACTIONS.identityUpdated,
        resource: AUDIT_RESOURCES.identity,
        resourceId: String(SINGLE_ROW_ID),
        details: {
          version: nextVersion,
          hasLogo: Boolean(content.logo.url),
          hasCover: Boolean(content.cover.desktopUrl),
          hasFavicon: Boolean(content.favicon.url),
          values: content.values.length,
        },
      });

      // BORRADO DIFERIDO: los activos que estaban en el borrador anterior y ya no
      // están ni en el nuevo borrador ni en lo publicado. Nunca borra lo que sigue
      // en uso (p. ej. la imagen publicada que aún se ve en la web).
      const removed = diffRemovedAssets(
        normalizeContent(row?.draft ?? emptyContent()),
        content,
        row?.published ? normalizeContent(row.published) : null,
        extractCloudinaryPublicId,
      );
      const cleanup = await cleanupIdentityAssets(removed, cleanupLog(req));

      return res.json({
        draft: content,
        version: updated?.version ?? nextVersion,
        updatedAt: updated?.updatedAt ?? null,
        hasPendingChanges: hasPendingChanges(
          content,
          row?.published ? normalizeContent(row.published) : null,
        ),
        removedAssets: cleanup,
      });
    } catch (err) {
      req.log.error({ err }, "Failed to save institutional identity draft");
      return res.status(500).json({
        error: "server_error",
        message: "No se pudo guardar el borrador.",
      });
    }
  },
);

// ─── ADMIN (superadmin): PUBLICAR (guarda y publica en UNA transacción) ──────
router.post(
  "/admin/institutional-identity/publish",
  requireRole(ROLES.SUPERADMIN),
  async (req, res) => {
    try {
      const body = (req.body ?? {}) as { content?: unknown; version?: unknown };
      const row = await readRow();
      const actual = row?.version ?? 1;
      const expected = toVersion(body.version);
      if (expected !== null && expected !== actual) {
        return res.status(409).json({
          error: "conflict",
          code: "version_conflict",
          message:
            "Otra sesión modificó la identidad institucional. Recarga para no publicar datos viejos.",
          current: serverState(row),
        });
      }

      // Lo que se publica es EXACTAMENTE lo que se guarda: si el panel envía sus
      // cambios pendientes, se persisten en la misma transacción que la publicación.
      const nextDraft =
        body.content !== undefined
          ? normalizeContent(body.content)
          : normalizeContent(row?.draft ?? emptyContent());

      const errors = validateContent(nextDraft);
      if (errors.length > 0) {
        return res.status(400).json({ error: "validation_error", message: errors.join(" ") });
      }
      if (isContentEmpty(nextDraft)) {
        return res.status(400).json({
          error: "empty_content",
          message: "No hay contenido que publicar. Añade al menos una imagen o un texto.",
        });
      }

      const now = new Date();
      const nextVersion = actual + 1;
      const actor = auditContext(req);
      await db.transaction(async (tx) => {
        await tx
          .insert(institutionalIdentityTable)
          .values({
            id: SINGLE_ROW_ID,
            draft: nextDraft,
            published: nextDraft,
            publishedAt: now,
            version: nextVersion,
            updatedBy: actor.username ?? null,
          })
          .onConflictDoUpdate({
            target: institutionalIdentityTable.id,
            set: {
              draft: nextDraft,
              published: nextDraft,
              publishedAt: now,
              version: nextVersion,
              updatedAt: now,
              updatedBy: actor.username ?? null,
            },
          });
      });

      await logAuditAction({
        ...actor,
        action: AUDIT_ACTIONS.identityPublished,
        resource: AUDIT_RESOURCES.identity,
        resourceId: String(SINGLE_ROW_ID),
        details: { version: nextVersion, savedAndPublished: true },
      });

      // AHORA sí: lo publicado anterior ya no se usa → se limpian los reemplazados.
      const removed = diffRemovedAssets(
        normalizeContent(row?.published ?? emptyContent()),
        nextDraft,
        nextDraft,
        extractCloudinaryPublicId,
      );
      const cleanup = await cleanupIdentityAssets(removed, cleanupLog(req));

      return res.json({
        // Se devuelve el borrador guardado (con publicIds) además del DTO público,
        // para que el panel actualice su formulario sin perder los identificadores.
        draft: nextDraft,
        published: publicIdentityDto(nextDraft, now),
        version: nextVersion,
        publishedAt: now,
        hasPendingChanges: false,
        removedAssets: cleanup,
      });
    } catch (err) {
      req.log.error({ err }, "Failed to publish institutional identity");
      return res.status(500).json({
        error: "server_error",
        message: "No se pudo publicar la identidad institucional.",
      });
    }
  },
);

// ─── ADMIN (superadmin): DESPUBLICAR (conserva el borrador y los assets) ─────
router.post(
  "/admin/institutional-identity/unpublish",
  requireRole(ROLES.SUPERADMIN),
  async (req, res) => {
    try {
      const row = await readRow();
      const actual = row?.version ?? 1;
      const expected = toVersion((req.body ?? {}).version);
      if (expected !== null && expected !== actual) {
        return res.status(409).json({
          error: "conflict",
          code: "version_conflict",
          message: "Otra sesión modificó la identidad institucional. Recarga para continuar.",
          current: serverState(row),
        });
      }

      const now = new Date();
      const nextVersion = actual + 1;
      const actor = auditContext(req);
      await db
        .insert(institutionalIdentityTable)
        .values({ id: SINGLE_ROW_ID, published: null, publishedAt: null, version: nextVersion, updatedBy: actor.username ?? null })
        .onConflictDoUpdate({
          target: institutionalIdentityTable.id,
          set: {
            published: null,
            publishedAt: null,
            version: nextVersion,
            updatedAt: now,
            updatedBy: actor.username ?? null,
          },
        });

      await logAuditAction({
        ...actor,
        action: AUDIT_ACTIONS.identityUnpublished,
        resource: AUDIT_RESOURCES.identity,
        resourceId: String(SINGLE_ROW_ID),
        details: { version: nextVersion },
      });

      // NO se borran assets: el borrador sigue usándolos y se puede republicar.
      const draft = normalizeContent(row?.draft ?? emptyContent());
      return res.json({
        draft,
        published: null,
        publishedAt: null,
        version: nextVersion,
        hasPendingChanges: !isContentEmpty(draft),
      });
    } catch (err) {
      req.log.error({ err }, "Failed to unpublish institutional identity");
      return res.status(500).json({
        error: "server_error",
        message: "No se pudo despublicar la identidad institucional.",
      });
    }
  },
);

/**
 * POST /admin/institutional-identity/discard-assets — anti-huérfanos.
 *
 * Cuando el panel sube una imagen y la REEMPLAZA antes de guardar, el archivo subido
 * quedaría huérfano. El panel envía aquí los publicIds que ya no usa; el servidor
 * borra SOLO los que (a) son de nuestras carpetas y (b) NO están referenciados por el
 * borrador ni por lo publicado. Nunca toca nada en uso.
 */
router.post(
  "/admin/institutional-identity/discard-assets",
  requireRole(ROLES.SUPERADMIN),
  async (req, res) => {
    try {
      const body = (req.body ?? {}) as { publicIds?: unknown };
      const requested = Array.isArray(body.publicIds)
        ? body.publicIds.filter((id): id is string => typeof id === "string" && id.length > 0)
        : [];
      if (requested.length === 0) {
        return res.status(400).json({
          error: "validation_error",
          message: "Indica al menos un publicId a descartar.",
        });
      }

      const row = await readRow();
      const { draft, published } = rowContent(row);
      const referenced = new Set([
        ...collectAssetPublicIds(draft, extractCloudinaryPublicId),
        ...(published ? collectAssetPublicIds(published, extractCloudinaryPublicId) : []),
      ]);

      const toDelete = requested.filter((id) => isOwnedPublicId(id) && !referenced.has(id));
      const cleanup = await cleanupIdentityAssets(toDelete, cleanupLog(req));

      const actor = auditContext(req);
      await logAuditAction({
        ...actor,
        action: AUDIT_ACTIONS.identityAssetsDiscarded,
        resource: AUDIT_RESOURCES.identity,
        resourceId: String(SINGLE_ROW_ID),
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
      req.log.error({ err }, "Failed to discard institutional identity assets");
      return res.status(500).json({
        error: "server_error",
        message: "No se pudieron descartar los archivos reemplazados.",
      });
    }
  },
);

export default router;

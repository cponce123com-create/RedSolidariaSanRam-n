import { Router, type IRouter } from "express";
import { db, institutionalIdentityTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireRole, ROLES } from "../middleware/roles";
import { logAuditAction } from "../middleware/auth-utils";
import { AUDIT_ACTIONS, AUDIT_RESOURCES, auditContext } from "../lib/audit";
import {
  emptyContent,
  isContentEmpty,
  normalizeContent,
  publicIdentityDto,
  validateContent,
} from "../lib/institutional-identity";

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

// ─── ADMIN (superadmin): borrador + publicado ────────────────────────────────
router.get(
  "/admin/institutional-identity",
  requireRole(ROLES.SUPERADMIN),
  async (req, res) => {
    try {
      const row = await readRow();
      res.setHeader("Cache-Control", "private, no-store");
      res.json({
        draft: normalizeContent(row?.draft ?? emptyContent()),
        published: row?.published
          ? publicIdentityDto(row.published, row.publishedAt)
          : null,
        publishedAt: row?.publishedAt ?? null,
        updatedAt: row?.updatedAt ?? null,
        updatedBy: row?.updatedBy ?? null,
      });
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
      // normalizeContent sanea (anti-XSS) y recorta; validateContent aplica las
      // reglas de negocio. El borrador NO se publica: el público sigue viendo el
      // contenido publicado hasta que se pulse «Publicar».
      const content = normalizeContent(req.body);
      const errors = validateContent(content);
      if (errors.length > 0) {
        return res.status(400).json({
          error: "validation_error",
          message: errors.join(" "),
        });
      }

      const actor = auditContext(req);
      const [row] = await db
        .insert(institutionalIdentityTable)
        .values({ id: SINGLE_ROW_ID, draft: content, updatedBy: actor.username ?? null })
        .onConflictDoUpdate({
          target: institutionalIdentityTable.id,
          set: {
            draft: content,
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
          hasLogo: Boolean(content.logo.url),
          hasCover: Boolean(content.cover.desktopUrl),
          values: content.values.length,
        },
      });

      return res.json({ draft: content, updatedAt: row?.updatedAt ?? null });
    } catch (err) {
      req.log.error({ err }, "Failed to save institutional identity draft");
      return res.status(500).json({
        error: "server_error",
        message: "No se pudo guardar el borrador.",
      });
    }
  },
);

// ─── ADMIN (superadmin): PUBLICAR el borrador ────────────────────────────────
router.post(
  "/admin/institutional-identity/publish",
  requireRole(ROLES.SUPERADMIN),
  async (req, res) => {
    try {
      const row = await readRow();
      const draft = normalizeContent(row?.draft ?? emptyContent());
      if (isContentEmpty(draft)) {
        return res.status(400).json({
          error: "empty_content",
          message: "No hay contenido que publicar. Guarda el borrador primero.",
        });
      }

      const now = new Date();
      const actor = auditContext(req);
      await db
        .insert(institutionalIdentityTable)
        .values({
          id: SINGLE_ROW_ID,
          published: draft,
          publishedAt: now,
          updatedBy: actor.username ?? null,
        })
        .onConflictDoUpdate({
          target: institutionalIdentityTable.id,
          set: {
            published: draft,
            publishedAt: now,
            updatedAt: now,
            updatedBy: actor.username ?? null,
          },
        });

      await logAuditAction({
        ...actor,
        action: AUDIT_ACTIONS.identityPublished,
        resource: AUDIT_RESOURCES.identity,
        resourceId: String(SINGLE_ROW_ID),
      });

      return res.json({ published: publicIdentityDto(draft, now) });
    } catch (err) {
      req.log.error({ err }, "Failed to publish institutional identity");
      return res.status(500).json({
        error: "server_error",
        message: "No se pudo publicar la identidad institucional.",
      });
    }
  },
);

// ─── ADMIN (superadmin): DESPUBLICAR (conserva el borrador) ───────────────────
router.post(
  "/admin/institutional-identity/unpublish",
  requireRole(ROLES.SUPERADMIN),
  async (req, res) => {
    try {
      const now = new Date();
      const actor = auditContext(req);
      await db
        .insert(institutionalIdentityTable)
        .values({
          id: SINGLE_ROW_ID,
          published: null,
          publishedAt: null,
          updatedBy: actor.username ?? null,
        })
        .onConflictDoUpdate({
          target: institutionalIdentityTable.id,
          set: {
            published: null,
            publishedAt: null,
            updatedAt: now,
            updatedBy: actor.username ?? null,
          },
        });

      await logAuditAction({
        ...actor,
        action: AUDIT_ACTIONS.identityUnpublished,
        resource: AUDIT_RESOURCES.identity,
        resourceId: String(SINGLE_ROW_ID),
      });

      return res.json({ published: null });
    } catch (err) {
      req.log.error({ err }, "Failed to unpublish institutional identity");
      return res.status(500).json({
        error: "server_error",
        message: "No se pudo despublicar la identidad institucional.",
      });
    }
  },
);

export default router;

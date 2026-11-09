import { Router } from "express";
import { requireAdmin } from "../middleware/require-admin";
import { requireRole, ROLES } from "../middleware/roles";
import { checkFacebookConnection } from "../lib/facebook";
import { facebookPublishConfiguration } from "../lib/facebook-publisher";
import { readFacebookPublication, requestFacebookPublication } from "../lib/facebook-outbox";

const router = Router();

router.get("/admin/integrations/facebook/status", requireAdmin, requireRole(ROLES.SUPERADMIN), async (_req, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  const connection = await checkFacebookConnection();
  const config = facebookPublishConfiguration();
  return res.json({ ...connection, autoPublishEnabled: config.enabled, siteUrlConfigured: Boolean(config.siteUrl) });
});

const contentRoles = [requireAdmin, requireRole(ROLES.ADMIN, ROLES.MODERATOR)];
function resource(params: Record<string, unknown>) {
  const id = Number(params.id);
  const kind = params.kind;
  return (kind === "news" || kind === "campaign") && Number.isSafeInteger(id) && id > 0 ? { kind, id } as const : null;
}

router.get("/admin/integrations/facebook/publications/:kind/:id", ...contentRoles, async (req, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  const source = resource(req.params);
  if (!source) return res.status(400).json({ message: "Contenido inválido." });
  const publication = await readFacebookPublication(source.kind, source.id);
  return res.json({ publication, autoPublishEnabled: facebookPublishConfiguration().enabled });
});

router.post("/admin/integrations/facebook/publications/:kind/:id", ...contentRoles, async (req, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  const source = resource(req.params);
  if (!source) return res.status(400).json({ message: "Contenido inválido." });
  const result = await requestFacebookPublication(source.kind, source.id, req.body?.confirmNotPublished === true);
  if (!result.ok) return res.status(409).json({ message: result.message });
  return res.status(202).json(result);
});

export default router;

import { Router, type RequestHandler } from "express";
import { requireAdmin } from "../middleware/require-admin";
import { requireRole, ROLES } from "../middleware/roles";
import { checkFacebookConnection } from "../lib/facebook";
import { facebookPublishConfiguration, facebookMessage, isFacebookSource } from "../lib/facebook-publisher";
import { readFacebookContent, readFacebookPublication, requestFacebookPublication } from "../lib/facebook-outbox";

import { z } from "zod";
import { donationFacebookContent } from "../lib/facebook-public-content";

const router = Router();
const draftSchema = z.object({
  amount: z.number().finite().nonnegative(),
  collaborationType: z.enum(["dinero", "productos", "servicios", "logistica"]),
  campaignId: z.number().int().positive().nullable(),
  campaignTitle: z.string().max(300).nullable(),
  recognitionName: z.string().max(210).nullable(),
  publicationTemplate: z.enum(["agradecimiento", "impacto", "comunidad"]),
  publicationImageUrl: z.string().url().max(2000).nullable(),
});
router.post("/admin/integrations/facebook/donation-preview", requireAdmin, requireRole(ROLES.ADMIN), (req, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  const parsed = draftSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Completa el tipo y un monto válido para ver la plantilla." });
  const content = donationFacebookContent({ ...parsed.data, id: 0, campaignImage: null });
  const config = facebookPublishConfiguration();
  const formatted = config.siteUrl ? facebookMessage(content, config.siteUrl) : null;
  return res.json({ title: content.title, summary: content.summary, imageUrl: content.imageUrl, message: formatted?.message ?? `${content.title}\n\n${content.summary}`, link: formatted?.link ?? null });
});

router.get("/admin/integrations/facebook/status", requireAdmin, requireRole(ROLES.SUPERADMIN), async (_req, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  const connection = await checkFacebookConnection();
  const config = facebookPublishConfiguration();
  return res.json({ ...connection, autoPublishEnabled: config.enabled, siteUrlConfigured: Boolean(config.siteUrl), configurationIssues: config.issues });
});

function contentAccess(write: boolean): RequestHandler {
  return (req, res, next) => {
    const roles = req.params.kind === "donation"
      ? write ? [ROLES.ADMIN] : [ROLES.ADMIN, ROLES.SUPERVISOR]
      : [ROLES.ADMIN, ROLES.MODERATOR];
    return requireRole(...roles)(req, res, next);
  };
}
function resource(params: Record<string, unknown>) {
  const id = Number(params.id);
  const kind = params.kind;
  return isFacebookSource(kind) && Number.isSafeInteger(id) && id > 0 ? { kind, id } as const : null;
}

router.get("/admin/integrations/facebook/publications/:kind/:id", requireAdmin, contentAccess(false), async (req, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  const source = resource(req.params);
  if (!source) return res.status(400).json({ message: "Contenido inválido." });
  const [publication, content] = await Promise.all([readFacebookPublication(source.kind, source.id), readFacebookContent(source.kind, source.id)]);
  const config = facebookPublishConfiguration();
  return res.json({ publication, autoPublishEnabled: config.enabled, configurationIssues: config.issues, publishable: Boolean(content), canRequest: req.session?.adminUser?.role !== ROLES.SUPERVISOR,
    preview: content ? { title: content.title, summary: content.summary, imageUrl: content.imageUrl ?? null,
      link: config.siteUrl ? facebookMessage(content, config.siteUrl).link : null,
      message: config.siteUrl ? facebookMessage(content, config.siteUrl).message : null } : null });
});

// On-demand, read-only diagnosis. Never enqueues, retries or publishes a test contribution.
router.get("/admin/integrations/facebook/publications/:kind/:id/diagnosis", requireAdmin, contentAccess(false), async (req, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  const source = resource(req.params);
  if (!source) return res.status(400).json({ message: "Contenido inválido." });
  const config = facebookPublishConfiguration();
  const [publication, content] = await Promise.all([readFacebookPublication(source.kind, source.id), readFacebookContent(source.kind, source.id)]);
  if (!content) return res.json({ status: "ineligible", message: "El contenido está retirado, anulado o todavía no cumple las condiciones para publicarse. No se hará un nuevo envío.", publication });
  if (!config.enabled) return res.json({ status: "configuration", message: config.issues.join(" "), publication });
  const connection = await checkFacebookConnection();
  return res.json({ status: connection.status, message: connection.status === "connected"
    ? "El token identifica la página correcta. Esta consulta no comprueba el permiso de escritura ni crea publicaciones. Revisa el error del último intento antes de reintentar."
    : connection.message, publication });
});

router.post("/admin/integrations/facebook/publications/:kind/:id", requireAdmin, contentAccess(true), async (req, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  const source = resource(req.params);
  if (!source) return res.status(400).json({ message: "Contenido inválido." });
  const result = await requestFacebookPublication(source.kind, source.id, req.body?.confirmNotPublished === true);
  if (!result.ok) return res.status(409).json({ message: result.message });
  return res.status(202).json(result);
});

export default router;

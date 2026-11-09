import { Router } from "express";
import { requireAdmin } from "../middleware/require-admin";
import { requireRole, ROLES } from "../middleware/roles";
import { checkFacebookConnection } from "../lib/facebook";

const router = Router();

router.get("/admin/integrations/facebook/status", requireAdmin, requireRole(ROLES.SUPERADMIN), async (_req, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  return res.json(await checkFacebookConnection());
});

export default router;

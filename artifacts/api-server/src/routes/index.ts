import { Router, type IRouter } from "express";
import healthRouter from "./health";
import campaignsRouter from "./campaigns";
import campaignUpdatesRouter from "./campaign-updates";
import campaignImagesRouter from "./campaign-images";
import campaignExpensesRouter from "./campaign-expenses";
import campaignEvidenceRouter from "./campaign-evidence";
import campaignLeftoversRouter from "./campaign-leftovers";
import campaignBudgetsRouter from "./campaign-budgets";
import campaignTransparencyRouter from "./campaign-transparency";
import campaignMovementsRouter from "./campaign-movements";
import ledgerAuditRouter from "./ledger-audit";
import donationsRouter from "./donations";
import donorsRouter from "./donors";
import newsRouter from "./news";
import testimonialsRouter from "./testimonials";
import statsRouter from "./stats";
import contactRouter from "./contact";
import volunteersRouter from "./volunteers";
import adminRouter from "./admin";
import communityReportsRouter from "./community-reports";
import petsRouter from "./pets";
import alliesRouter from "./allies";
import dashboardRouter from "./dashboard";
import faqRouter from "./faq";
import adminUsersRouter from "./admin-users";
import adminTwoFactorRouter from "./admin-2fa";
import settingsRouter from "./settings";
import institutionalIdentityRouter from "./institutional-identity";
import cmsRouter from "./cms";
import auditLogsRouter from "./audit-logs";
import reportsRouter from "./reports";
import supervisorRouter from "./supervisor";
import volunteerTeamsRouter from "./volunteer-teams";
import uploadsRouter from "./uploads";
import certificatesRouter from "./certificates";
import maintenanceRouter from "./maintenance";
import maintenanceExpensesRouter from "./maintenance-expenses";
import campaignClosureRouter from "./campaign-closure";
import { requireAdmin } from "../middleware/require-admin";
import { adminActionLimiter } from "../middleware/rate-limit";

const router: IRouter = Router();

// ─── Rutas de AUTENTICACIÓN (públicas bajo /admin) ────────────────────────────
// Deben montarse ANTES del gate global: /admin/login, /admin/logout, /admin/me
// y /admin/2fa/login (paso 2 del login) no pueden exigir sesión previa.
router.use(adminRouter);
router.use(adminTwoFactorRouter);

// ─── Gate global de autorización ──────────────────────────────────────────────
// UN solo punto de control para toda ruta /admin/* que no sea de autenticación:
// exige sesión de administrador + rate limit. Evita chequeos manuales dispersos
// y que un router montado antes intercepte rutas públicas del prefijo /admin.
router.use("/admin", requireAdmin, adminActionLimiter);

router.use(healthRouter);
router.use(campaignsRouter);
router.use(campaignUpdatesRouter);
router.use(campaignImagesRouter);
router.use(campaignExpensesRouter);
router.use(campaignEvidenceRouter);
router.use(campaignLeftoversRouter);
router.use(campaignBudgetsRouter);
router.use(campaignTransparencyRouter);
router.use(campaignMovementsRouter);
router.use(ledgerAuditRouter);
router.use(certificatesRouter);
router.use(donationsRouter);
router.use(donorsRouter);
router.use(auditLogsRouter);
router.use(reportsRouter);
router.use(supervisorRouter);
router.use(newsRouter);
router.use(testimonialsRouter);
router.use(statsRouter);
router.use(contactRouter);
router.use(volunteersRouter);
router.use(communityReportsRouter);
router.use(petsRouter);
router.use(alliesRouter);
router.use(dashboardRouter);
router.use(faqRouter);
router.use(adminUsersRouter);
router.use(settingsRouter);
// Identidad institucional (Fase 3): la vista pública vive fuera de /admin y la
// administrativa queda tras el gate global + requireRole(SUPERADMIN).
router.use(institutionalIdentityRouter);
// CMS institucional (Fase 2): la vista pública vive fuera de /admin y la
// administrativa queda tras el gate global + requireRole(SUPERADMIN).
router.use(cmsRouter);
router.use(maintenanceRouter);
router.use(maintenanceExpensesRouter);
router.use(campaignClosureRouter);
router.use(uploadsRouter);

export default router;

import { Router, type IRouter } from "express";
import healthRouter from "./health";
import campaignsRouter from "./campaigns";
import campaignUpdatesRouter from "./campaign-updates";
import campaignImagesRouter from "./campaign-images";
import campaignExpensesRouter from "./campaign-expenses";
import campaignEvidenceRouter from "./campaign-evidence";
import campaignTransparencyRouter from "./campaign-transparency";
import donationsRouter from "./donations";
import newsRouter from "./news";
import testimonialsRouter from "./testimonials";
import statsRouter from "./stats";
import contactRouter from "./contact";
import volunteersRouter from "./volunteers";
import adminRouter from "./admin";
import communityReportsRouter from "./community-reports";

const router: IRouter = Router();

router.use(healthRouter);
router.use(campaignsRouter);
router.use(campaignUpdatesRouter);
router.use(campaignImagesRouter);
router.use(campaignExpensesRouter);
router.use(campaignEvidenceRouter);
router.use(campaignTransparencyRouter);
router.use(donationsRouter);
router.use(newsRouter);
router.use(testimonialsRouter);
router.use(statsRouter);
router.use(contactRouter);
router.use(volunteersRouter);
router.use(adminRouter);
router.use(communityReportsRouter);

export default router;

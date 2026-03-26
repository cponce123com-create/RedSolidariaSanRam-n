import { Router, type IRouter } from "express";
import healthRouter from "./health";
import campaignsRouter from "./campaigns";
import newsRouter from "./news";
import testimonialsRouter from "./testimonials";
import statsRouter from "./stats";
import contactRouter from "./contact";
import volunteersRouter from "./volunteers";
import adminRouter from "./admin";

const router: IRouter = Router();

router.use(healthRouter);
router.use(campaignsRouter);
router.use(newsRouter);
router.use(testimonialsRouter);
router.use(statsRouter);
router.use(contactRouter);
router.use(volunteersRouter);
router.use(adminRouter);

export default router;

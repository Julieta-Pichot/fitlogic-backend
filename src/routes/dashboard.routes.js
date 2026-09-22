import { Router } from 'express';
import { authenticateToken, requireAdmin } from '../middlewares/auth.middleware.js';
import { validateRequest } from '../middlewares/validate.middleware.js';
import { getDashboardStats } from '../controllers/dashboard.controller.js';
import { dashboardStatsValidator } from '../validators/dashboard.validator.js';

const router = Router();

router.use(authenticateToken, requireAdmin);
router.get('/stats', dashboardStatsValidator, validateRequest, getDashboardStats);

export default router;

import { Router } from 'express';
import { authenticateToken, requireAdmin } from '../middlewares/auth.middleware.js';
import { getSystemConfig, updateGymConfig } from '../controllers/config.controller.js';

const router = Router();

router.get('/system', authenticateToken, getSystemConfig);
router.put('/gym', authenticateToken, requireAdmin, updateGymConfig);

export default router;

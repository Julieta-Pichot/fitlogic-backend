import { Router } from 'express';
import { validateRequest } from '../middlewares/validate.middleware.js';
import { updateGymValidator } from '../validators/config.validator.js';
import { authenticateToken, requireAdmin } from '../middlewares/auth.middleware.js';
import { getSystemConfig, updateGymConfig } from '../controllers/config.controller.js';

const router = Router();

router.get('/system', authenticateToken, getSystemConfig);
router.put('/gym', authenticateToken, requireAdmin, updateGymValidator, validateRequest, updateGymConfig);

export default router;

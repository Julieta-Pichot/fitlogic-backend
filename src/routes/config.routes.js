import { Router } from 'express';
import { authenticateToken } from '../middlewares/auth.middleware.js';
import { getSystemConfig } from '../controllers/config.controller.js';

const router = Router();

router.get('/system', authenticateToken, getSystemConfig);

export default router;

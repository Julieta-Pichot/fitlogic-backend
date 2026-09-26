import { Router } from 'express';
import { authenticateToken, requireRecepcionista } from '../middlewares/auth.middleware.js';
import { validateRequest } from '../middlewares/validate.middleware.js';
import * as recepcionController from '../controllers/recepcion.controller.js';
import { recentPaymentsValidator, updateProfileValidator } from '../validators/recepcion.validator.js';

const router = Router();

router.use(authenticateToken, requireRecepcionista);

router.get('/dashboard/stats', recepcionController.getDashboardStats);
router.get('/pagos', recentPaymentsValidator, validateRequest, recepcionController.listRecentPayments);
router.get('/planes', recepcionController.listActivePlans);
router.patch('/me', updateProfileValidator, validateRequest, recepcionController.updateMyProfile);

export default router;

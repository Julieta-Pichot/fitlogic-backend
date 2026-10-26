import { Router } from 'express';
import { authenticateToken, requireReceptionEnabled } from '../middlewares/auth.middleware.js';
import { validateRequest } from '../middlewares/validate.middleware.js';
import * as recepcionController from '../controllers/recepcion.controller.js';
import { registerPaymentValidator, recentPaymentsValidator, updateProfileValidator } from '../validators/recepcion.validator.js';

const router = Router();

router.use(authenticateToken, ...requireReceptionEnabled);

router.get('/dashboard/stats', recepcionController.getDashboardStats);
router.get('/pagos', recentPaymentsValidator, validateRequest, recepcionController.listRecentPayments);
router.get('/planes', recepcionController.listActivePlans);
router.post('/pagos', registerPaymentValidator, validateRequest, recepcionController.registerPayment);
router.patch('/me', updateProfileValidator, validateRequest, recepcionController.updateMyProfile);

export default router;

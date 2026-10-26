import { Router } from 'express';
import { authenticateToken, requireAdminOrReception, requireCliente, requireRole } from '../middlewares/auth.middleware.js';
import { validateRequest } from '../middlewares/validate.middleware.js';
import * as quotasController from '../controllers/quotas.controller.js';
import {
  clientIdValidator,
  confirmPaymentValidator,
  createQuotaValidator,
  quotaIdValidator,
} from '../validators/quota.validator.js';

const router = Router();

router.get('/me', authenticateToken, requireCliente, quotasController.listMyQuotas);
router.get('/client/:clientId', authenticateToken, ...requireAdminOrReception, clientIdValidator, validateRequest, quotasController.listClientQuotas);
router.post('/', authenticateToken, requireRole('ADMIN', 'RECEPCIONISTA', 'CLIENTE'), createQuotaValidator, validateRequest, quotasController.createQuota);
router.post('/:id/confirm-payment', authenticateToken, ...requireAdminOrReception, confirmPaymentValidator, validateRequest, quotasController.confirmPayment);

export default router;

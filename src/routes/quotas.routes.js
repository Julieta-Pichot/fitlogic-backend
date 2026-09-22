import { Router } from 'express';
import { authenticateToken, requireAdmin, requireCliente, requireStaff } from '../middlewares/auth.middleware.js';
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
router.get('/client/:clientId', authenticateToken, requireStaff, clientIdValidator, validateRequest, quotasController.listClientQuotas);
router.post('/', authenticateToken, createQuotaValidator, validateRequest, quotasController.createQuota);
router.post('/:id/confirm-payment', authenticateToken, requireStaff, confirmPaymentValidator, validateRequest, quotasController.confirmPayment);

export default router;

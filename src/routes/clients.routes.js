import { Router } from 'express';
import { authenticateToken, requireAdmin, requireCliente, requireStaff } from '../middlewares/auth.middleware.js';
import { validateRequest } from '../middlewares/validate.middleware.js';
import * as clientsController from '../controllers/clients.controller.js';
import {
  clearanceValidator,
  clientIdValidator,
  createClientValidator,
  listClientsValidator,
  statusValidator,
  updateClientValidator,
} from '../validators/client.validator.js';

const router = Router();

router.get('/me', authenticateToken, requireCliente, clientsController.getCurrentClient);
router.get('/', authenticateToken, requireStaff, listClientsValidator, validateRequest, clientsController.listClients);
router.post('/', authenticateToken, requireStaff, createClientValidator, validateRequest, clientsController.createClient);
router.get('/:id', authenticateToken, requireStaff, clientIdValidator, validateRequest, clientsController.getClient);
router.patch('/:id', authenticateToken, requireStaff, updateClientValidator, validateRequest, clientsController.updateClient);
router.put('/:id/medical-clearance', authenticateToken, requireStaff, clearanceValidator, validateRequest, clientsController.updateMedicalClearance);
router.patch('/:id/status', authenticateToken, requireAdmin, statusValidator, validateRequest, clientsController.changeClientStatus);

export default router;

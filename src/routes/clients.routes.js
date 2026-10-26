import { Router } from 'express';
import { authenticateToken, requireAdmin, requireAdminOrReception, requireCliente } from '../middlewares/auth.middleware.js';
import { validateRequest } from '../middlewares/validate.middleware.js';
import { upload } from '../middlewares/upload.middleware.js';
import * as clientsController from '../controllers/clients.controller.js';
import {
  clientIdValidator,
  createClientValidator,
  listClientsValidator,
  statusValidator,
  updateClientValidator,
} from '../validators/client.validator.js';

const router = Router();

router.get('/me', authenticateToken, requireCliente, clientsController.getCurrentClient);
router.get('/', authenticateToken, ...requireAdminOrReception, listClientsValidator, validateRequest, clientsController.listClients);
router.post('/', authenticateToken, ...requireAdminOrReception, createClientValidator, validateRequest, clientsController.createClient);
router.get('/:id', authenticateToken, ...requireAdminOrReception, clientIdValidator, validateRequest, clientsController.getClient);
router.patch('/:id', authenticateToken, ...requireAdminOrReception, updateClientValidator, validateRequest, clientsController.updateClient);
// authenticateToken va antes que multer: el destino del archivo depende de req.user.
router.post('/:id/medical-clearance', authenticateToken, ...requireAdminOrReception, clientIdValidator, validateRequest, upload.single('archivo'), clientsController.uploadMedicalClearance);
router.patch('/:id/status', authenticateToken, requireAdmin, statusValidator, validateRequest, clientsController.changeClientStatus);

export default router;

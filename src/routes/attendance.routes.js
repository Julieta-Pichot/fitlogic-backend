import { Router } from 'express';
import { authenticateToken, requireAdminOrReception } from '../middlewares/auth.middleware.js';
import { validateRequest } from '../middlewares/validate.middleware.js';
import * as attendanceController from '../controllers/attendance.controller.js';
import {
  clientIdValidator,
  listAttendanceValidator,
  registerAttendanceValidator,
} from '../validators/attendance.validator.js';

const router = Router();

router.get('/', authenticateToken, ...requireAdminOrReception, listAttendanceValidator, validateRequest, attendanceController.listAttendance);
router.get('/access/:clientId', authenticateToken, ...requireAdminOrReception, clientIdValidator, validateRequest, attendanceController.validateAccess);
// Solo caja/recepción registra asistencias: ni el profesor ni el propio cliente (evita "marcarse presente" desde su casa).
router.post('/', authenticateToken, ...requireAdminOrReception, registerAttendanceValidator, validateRequest, attendanceController.registerAttendance);

export default router;

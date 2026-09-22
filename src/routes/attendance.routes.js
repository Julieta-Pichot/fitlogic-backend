import { Router } from 'express';
import { authenticateToken, requireCliente, requireStaff } from '../middlewares/auth.middleware.js';
import { validateRequest } from '../middlewares/validate.middleware.js';
import * as attendanceController from '../controllers/attendance.controller.js';
import {
  clientIdValidator,
  listAttendanceValidator,
  registerAttendanceValidator,
} from '../validators/attendance.validator.js';

const router = Router();

router.get('/', authenticateToken, requireStaff, listAttendanceValidator, validateRequest, attendanceController.listAttendance);
router.get('/access/:clientId', authenticateToken, requireStaff, clientIdValidator, validateRequest, attendanceController.validateAccess);
router.post('/', authenticateToken, registerAttendanceValidator, validateRequest, attendanceController.registerAttendance);

export default router;

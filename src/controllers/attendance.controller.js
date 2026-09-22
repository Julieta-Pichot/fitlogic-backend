import * as attendanceService from '../services/attendance.service.js';
import { sendSuccess } from '../utils/response.js';
import { ForbiddenError } from '../errors/AppError.js';

export const listAttendance = async (req, res, next) => {
  try { return sendSuccess(res, { data: await attendanceService.listAttendance(req.query) }); } catch (error) { return next(error); }
};

export const validateAccess = async (req, res, next) => {
  try { return sendSuccess(res, { data: await attendanceService.validateClientAccess(req.params.clientId) }); } catch (error) { return next(error); }
};

export const registerAttendance = async (req, res, next) => {
  try {
    if (req.user.rol?.nombre === 'CLIENTE' && req.user.cliente?.id !== Number(req.body.clienteId)) {
      throw new ForbiddenError('Solo podés registrar tu propia asistencia');
    }
    const data = await attendanceService.registerAttendance(req.body.clienteId, req.user.id);
    return sendSuccess(res, { message: 'Asistencia registrada correctamente', data, statusCode: 201 });
  } catch (error) { return next(error); }
};

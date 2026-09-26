import * as recepcionService from '../services/recepcion.service.js';
import { sendSuccess } from '../utils/response.js';

export const getDashboardStats = async (_req, res, next) => {
  try { return sendSuccess(res, { data: await recepcionService.getDashboardStats() }); } catch (error) { return next(error); }
};

export const listRecentPayments = async (req, res, next) => {
  try { return sendSuccess(res, { data: await recepcionService.listRecentPayments(Number(req.query.limit ?? 10)) }); } catch (error) { return next(error); }
};

export const listActivePlans = async (_req, res, next) => {
  try { return sendSuccess(res, { data: await recepcionService.listActivePlans() }); } catch (error) { return next(error); }
};

export const updateMyProfile = async (req, res, next) => {
  try {
    const user = await recepcionService.updateMyProfile(req.user.id, req.body);
    return sendSuccess(res, { message: 'Datos actualizados correctamente', data: { user } });
  } catch (error) { return next(error); }
};

import * as dashboardService from '../services/dashboard.service.js';
import { sendSuccess } from '../utils/response.js';

export const getDashboardStats = async (req, res, next) => {
  try {
    const months = Number(req.query.months ?? 6);
    const data = await dashboardService.getDashboardStats(months);
    return sendSuccess(res, { data });
  } catch (error) {
    return next(error);
  }
};

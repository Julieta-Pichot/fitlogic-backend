import * as plansService from '../services/plans.service.js';
import { sendSuccess } from '../utils/response.js';

export const listPlans = async (req, res, next) => {
  try {
    const data = await plansService.listPlans(req.user.gimnasioId, req.query);
    return sendSuccess(res, { data });
  } catch (error) {
    return next(error);
  }
};

export const getPlan = async (req, res, next) => {
  try {
    const data = await plansService.getPlanById(req.user.gimnasioId, Number(req.params.id));
    return sendSuccess(res, { data });
  } catch (error) {
    return next(error);
  }
};

export const createPlan = async (req, res, next) => {
  try {
    const data = await plansService.createPlan(req.user.gimnasioId, req.user.id, req.body);
    return sendSuccess(res, {
      message: 'Plan creado correctamente',
      data,
      statusCode: 201,
    });
  } catch (error) {
    return next(error);
  }
};

export const updatePlan = async (req, res, next) => {
  try {
    const data = await plansService.updatePlan(req.user.gimnasioId, req.user.id, Number(req.params.id), req.body);
    return sendSuccess(res, { message: 'Plan actualizado correctamente', data });
  } catch (error) {
    return next(error);
  }
};

export const togglePlanActive = async (req, res, next) => {
  try {
    const data = await plansService.togglePlanActive(req.user.gimnasioId, req.user.id, Number(req.params.id), req.body.activo);
    return sendSuccess(res, { message: 'Estado del plan actualizado', data });
  } catch (error) {
    return next(error);
  }
};

export const deletePlan = async (req, res, next) => {
  try {
    await plansService.deletePlan(req.user.gimnasioId, req.user.id, Number(req.params.id));
    return sendSuccess(res, { message: 'Plan eliminado correctamente' });
  } catch (error) {
    return next(error);
  }
};

import * as promotionsService from '../services/promotions.service.js';
import { sendSuccess } from '../utils/response.js';

export const listPromotions = async (req, res, next) => {
  try {
    const data = await promotionsService.listPromotions(req.user.gimnasioId, req.query);
    return sendSuccess(res, { data });
  } catch (error) {
    return next(error);
  }
};

export const getPromotion = async (req, res, next) => {
  try {
    const data = await promotionsService.getPromotionById(req.user.gimnasioId, Number(req.params.id));
    return sendSuccess(res, { data });
  } catch (error) {
    return next(error);
  }
};

export const createPromotion = async (req, res, next) => {
  try {
    const data = await promotionsService.createPromotion(req.user.gimnasioId, req.user.id, req.body);
    return sendSuccess(res, {
      message: 'Promoción creada correctamente',
      data,
      statusCode: 201,
    });
  } catch (error) {
    return next(error);
  }
};

export const updatePromotion = async (req, res, next) => {
  try {
    const data = await promotionsService.updatePromotion(req.user.gimnasioId, req.user.id, Number(req.params.id), req.body);
    return sendSuccess(res, { message: 'Promoción actualizada correctamente', data });
  } catch (error) {
    return next(error);
  }
};

export const togglePromotionActive = async (req, res, next) => {
  try {
    const data = await promotionsService.togglePromotionActive(req.user.gimnasioId, req.user.id, Number(req.params.id), req.body.activo);
    return sendSuccess(res, { message: 'Estado de la promoción actualizado', data });
  } catch (error) {
    return next(error);
  }
};

export const deletePromotion = async (req, res, next) => {
  try {
    await promotionsService.deletePromotion(req.user.gimnasioId, req.user.id, Number(req.params.id));
    return sendSuccess(res, { message: 'Promoción eliminada correctamente' });
  } catch (error) {
    return next(error);
  }
};

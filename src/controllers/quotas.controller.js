import * as quotasService from '../services/quotas.service.js';
import { sendSuccess } from '../utils/response.js';

export const listMyQuotas = async (req, res, next) => {
  try { return sendSuccess(res, { data: await quotasService.listQuotas({ userId: req.user.id }) }); } catch (error) { return next(error); }
};

export const listClientQuotas = async (req, res, next) => {
  try { return sendSuccess(res, { data: await quotasService.listQuotas({ clientId: req.params.clientId }) }); } catch (error) { return next(error); }
};

export const createQuota = async (req, res, next) => {
  try {
    const isClient = req.user.rol?.nombre === 'CLIENTE';
    const data = await quotasService.createPendingQuota({
      userId: isClient ? req.user.id : undefined,
      clientId: isClient ? undefined : req.body.clientId,
      planId: req.body.planId,
    });
    return sendSuccess(res, { message: 'Solicitud de cuota creada como pendiente', data, statusCode: 201 });
  } catch (error) { return next(error); }
};

export const confirmPayment = async (req, res, next) => {
  try {
    const data = await quotasService.confirmQuotaPayment(req.params.id, req.body.metodoPagoId, req.body.referenciaExterna);
    return sendSuccess(res, { message: 'Pago confirmado y cuota activada', data });
  } catch (error) { return next(error); }
};

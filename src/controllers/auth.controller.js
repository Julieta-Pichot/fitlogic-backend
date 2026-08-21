import * as authService from '../services/auth.service.js';
import { sendSuccess } from '../utils/response.js';

export const login = async (req, res, next) => {
  try {
    const result = await authService.login(req.body);
    return sendSuccess(res, {
      message: 'Inicio de sesión exitoso',
      data: result,
    });
  } catch (error) {
    return next(error);
  }
};

export const me = async (req, res, next) => {
  try {
    const user = await authService.getCurrentUser(req.user.id);
    return sendSuccess(res, { data: { user } });
  } catch (error) {
    return next(error);
  }
};

export const changePassword = async (req, res, next) => {
  try {
    await authService.changePassword(req.user.id, req.body);
    return sendSuccess(res, { message: 'Contraseña actualizada correctamente' });
  } catch (error) {
    return next(error);
  }
};
